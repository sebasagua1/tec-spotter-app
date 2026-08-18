-- ============================================================
-- Moderación de contenido de usuario + soporte para borrar cuenta.
--
-- Cubre los requisitos de Apple para apps con UGC (guideline 1.2):
-- reportar contenido, bloquear personas abusivas, y que el
-- contenido bloqueado desaparezca de verdad.
--
-- El borrado de cuenta (guideline 5.1.1 v) se ejecuta desde la
-- Edge Function `delete-account`, que llama a auth.admin.deleteUser().
-- Aquí solo se prepara lo que el CASCADE no cubre.
-- ============================================================


-- ============================================================
-- 1. blocks — bloqueo unidireccional, efecto bidireccional.
--
-- Si A bloquea a B, ninguno de los dos ve al otro. Se guarda una
-- sola fila (quién bloqueó a quién) para poder desbloquear, pero
-- todas las consultas usan is_blocked(), que mira en los dos
-- sentidos: así B no puede deducir que A le bloqueó viendo que
-- él sí sigue apareciendo.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Nombre en el momento del bloqueo. Denormalizado a propósito: en cuanto
  -- alguien queda bloqueado desaparece de public_profiles, así que sin esta
  -- copia la pantalla de "bloqueados" solo podría mostrar UUIDs y el bloqueo
  -- sería imposible de deshacer con criterio.
  blocked_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocked_id_idx ON public.blocks (blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Cada quien gestiona su propia lista. Nadie puede leer quién le
-- bloqueó a él: solo las filas donde es el bloqueador.
CREATE POLICY "Users can read own blocks"
  ON public.blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block"
  ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock"
  ON public.blocks FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);


-- ============================================================
-- 2. is_blocked(a, b) — SECURITY DEFINER, mira en ambos sentidos.
--
-- Se usa dentro de políticas RLS y de la vista public_profiles,
-- donde el rol que consulta no puede leer la tabla blocks entera.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;


-- ============================================================
-- 3. Bloquear implica romper la relación existente.
--
-- Al bloquear se borra la amistad (en cualquier estado, incluida
-- una solicitud pendiente) y se saca a las dos personas de sus
-- DMs comunes. Sin esto, el bloqueado seguiría en la lista de
-- amigos del otro y el DM quedaría medio visible.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_block_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dm_name text;
BEGIN
  DELETE FROM public.friendships
  WHERE (requester_id = NEW.blocker_id AND addressee_id = NEW.blocked_id)
     OR (requester_id = NEW.blocked_id AND addressee_id = NEW.blocker_id);

  v_dm_name := '__dm_' || least(NEW.blocker_id, NEW.blocked_id)::text
                       || '_' || greatest(NEW.blocker_id, NEW.blocked_id)::text;

  DELETE FROM public.group_members
  WHERE user_id IN (NEW.blocker_id, NEW.blocked_id)
    AND group_id IN (SELECT id FROM public.groups WHERE name = v_dm_name);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_block_cleanup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_block_cleanup ON public.blocks;
CREATE TRIGGER trg_block_cleanup
  AFTER INSERT ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.on_block_cleanup();


-- ============================================================
-- 4. No se pueden mandar solicitudes de amistad a quien te bloqueó.
-- ============================================================
DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;

CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND NOT public.is_blocked(requester_id, addressee_id)
  );


-- ============================================================
-- 5. La gente bloqueada desaparece de public_profiles.
--
-- La vista corre con security_invoker = false (como su dueño) para
-- poder saltarse la RLS de profiles, pero auth.uid() sigue siendo
-- el de quien consulta, así que el filtro funciona por usuario.
-- ============================================================
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  id,
  name,
  avatar_url,
  major,
  semester,
  residence_type,
  interests,
  languages,
  campus_id,
  points,
  reputation,
  created_at
FROM public.profiles p
WHERE auth.uid() IS NOT NULL
  AND NOT public.is_blocked(auth.uid(), p.id);

GRANT SELECT ON public.public_profiles TO authenticated;


-- ============================================================
-- 6. Los mensajes de gente bloqueada no se leen.
-- ============================================================
DROP POLICY IF EXISTS "Users can view messages in their events or groups" ON public.messages;

CREATE POLICY "Users can view messages in their events or groups"
ON public.messages FOR SELECT TO authenticated
USING (
  NOT public.is_blocked(auth.uid(), sender_id)
  AND (
    sender_id = auth.uid()
    OR (event_id IS NOT NULL AND public.is_event_participant(event_id, auth.uid()))
    OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  )
);


-- ============================================================
-- 7. Los eventos de gente bloqueada no se ven.
-- ============================================================
DROP POLICY IF EXISTS "Events visibility policy" ON public.events;

CREATE POLICY "Events visibility policy"
  ON public.events FOR SELECT TO authenticated
  USING (
    NOT public.is_blocked(auth.uid(), creator_id)
    AND (
      privacy = 'open'
      OR creator_id = auth.uid()
      OR (privacy = 'friends' AND public.are_friends(creator_id, auth.uid()))
    )
  );


-- ============================================================
-- 8. reports: poder reportar también mensajes, y dar seguimiento.
--
-- `status` existe para poder triar desde el dashboard de Supabase
-- (Apple pide actuar sobre lo reportado en menos de 24 h).
-- El CHECK obliga a que cada reporte apunte a exactamente una cosa.
-- ============================================================
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS reported_message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_status_check
  CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed'));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reason_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_reason_check
  CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'fake', 'safety', 'other'));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_one_target;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_one_target CHECK (
    (reported_user_id    IS NOT NULL)::int
  + (reported_event_id   IS NOT NULL)::int
  + (reported_message_id IS NOT NULL)::int = 1
  );

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_details_len;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_details_len CHECK (details IS NULL OR length(details) <= 1000);

-- Un mismo usuario no reporta dos veces lo mismo (y de paso evita
-- que se pueda inundar la cola desde una sola cuenta).
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_user_target
  ON public.reports (reporter_id, reported_user_id)    WHERE reported_user_id    IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_event_target
  ON public.reports (reporter_id, reported_event_id)   WHERE reported_event_id   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_message_target
  ON public.reports (reporter_id, reported_message_id) WHERE reported_message_id IS NOT NULL;

-- No se puede reportar contenido propio.
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;

CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND (reported_user_id IS NULL OR reported_user_id <> auth.uid())
  );


-- ============================================================
-- 9. Borrar el propio mensaje.
--
-- Hace falta para moderación: quien escribe algo puede retirarlo,
-- y el borrado desde el dashboard sigue estando disponible para ti.
-- ============================================================
CREATE POLICY "Senders can delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());


-- ============================================================
-- 10. Borrado de cuenta: lo que el CASCADE no cubre.
--
-- auth.admin.deleteUser() borra auth.users y de ahí caen en
-- cascada profiles, events, participaciones, amistades, grupos
-- creados, mensajes, insignias, puntos y bloqueos. Lo que NO cae
-- son los objetos de Storage, así que la Edge Function borra
-- también la carpeta del avatar.
--
-- Los reportes hechos POR el usuario que se va se conservan sin
-- autor (reporter_id pasa a NULL) para no perder la cola de
-- moderación cuando alguien reporta y luego borra su cuenta.
-- ============================================================
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey;

ALTER TABLE public.reports
  ALTER COLUMN reporter_id DROP NOT NULL;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;
