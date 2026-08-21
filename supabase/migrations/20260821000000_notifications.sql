-- ============================================================
-- Avisos dentro de la app: solicitudes de unirse, solicitudes de
-- amistad y mensajes sin leer.
--
-- Hasta ahora no había forma de enterarse de nada sin ir a mirar. Lo
-- único que faltaba en el esquema era saber hasta dónde ha leído cada
-- quien en cada chat; lo demás ya se puede contar de lo que hay.
-- ============================================================


-- ============================================================
-- 1. Hasta dónde ha leído cada miembro.
--
-- DEFAULT now() a propósito: los miembros que ya existen quedan al día
-- en vez de despertar con el contador disparado por todo el historial.
-- ============================================================
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT now();

-- Los contadores filtran por grupo y fecha en cada consulta.
CREATE INDEX IF NOT EXISTS messages_group_created_idx
  ON public.messages (group_id, created_at DESC);


-- ============================================================
-- 2. Marcar un chat como leído.
--
-- Va por RPC porque group_members NO tiene política de UPDATE, y es
-- deliberado: dejar que cada quien edite su fila de membresía abriría
-- la puerta a reescribir group_id o user_id. La función solo toca
-- last_read_at y solo de quien llama.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_group_read(_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.group_members
  SET    last_read_at = now()
  WHERE  group_id = _group_id
    AND  user_id  = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_group_read(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_group_read(uuid) TO authenticated;


-- ============================================================
-- 3. Los tres contadores de la barra inferior, en una sola llamada.
--
-- SECURITY DEFINER para poder contar filas que la RLS no dejaría leer
-- en bruto (las solicitudes pendientes de MIS eventos incluyen a gente
-- cuyo perfil no tengo por qué poder listar). Solo devuelve números,
-- nunca filas, y siempre acotado a auth.uid().
-- ============================================================
CREATE OR REPLACE FUNCTION public.notification_counts()
RETURNS TABLE (join_requests bigint, friend_requests bigint, unread_messages bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Gente esperando a que la apruebe en eventos míos
    (SELECT count(*)
       FROM public.event_participants p
       JOIN public.events e ON e.id = p.event_id
      WHERE e.creator_id = auth.uid()
        AND e.is_active
        AND p.status = 'pending'),

    -- Solicitudes de amistad que me han mandado
    (SELECT count(*)
       FROM public.friendships f
      WHERE f.addressee_id = auth.uid()
        AND f.status = 'pending'
        AND NOT public.is_blocked(auth.uid(), f.requester_id)),

    -- Mensajes posteriores a mi última lectura, sin contar los míos.
    -- Bloquear ya saca a ambas partes de sus DMs comunes, pero en un
    -- grupo de tres o más la persona bloqueada sigue dentro.
    (SELECT count(*)
       FROM public.group_members gm
       JOIN public.messages m ON m.group_id = gm.group_id
      WHERE gm.user_id   = auth.uid()
        AND m.sender_id <> auth.uid()
        AND m.created_at > gm.last_read_at
        AND NOT public.is_blocked(auth.uid(), m.sender_id));
$$;

REVOKE EXECUTE ON FUNCTION public.notification_counts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.notification_counts() TO authenticated;


-- ============================================================
-- 4. Desglose por evento, para el aviso en cada tarjeta de Mis eventos.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pending_requests_by_event()
RETURNS TABLE (event_id uuid, pending bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.event_id, count(*)
    FROM public.event_participants p
    JOIN public.events e ON e.id = p.event_id
   WHERE e.creator_id = auth.uid()
     AND e.is_active
     AND p.status = 'pending'
   GROUP BY p.event_id;
$$;

REVOKE EXECUTE ON FUNCTION public.pending_requests_by_event() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pending_requests_by_event() TO authenticated;


-- ============================================================
-- 5. Desglose por chat, para el punto en cada grupo o DM de Amigos.
-- ============================================================
-- Devuelve también el nombre: los DM son grupos llamados
-- '__dm_<uuid menor>_<uuid mayor>' (ver create_dm), así que con el nombre
-- el cliente sabe a qué amigo corresponde cada chat sin consultas extra.
CREATE OR REPLACE FUNCTION public.unread_by_group()
RETURNS TABLE (group_id uuid, group_name text, unread bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.group_id, g.name, count(*)
    FROM public.group_members gm
    JOIN public.groups   g ON g.id = gm.group_id
    JOIN public.messages m ON m.group_id = gm.group_id
   WHERE gm.user_id   = auth.uid()
     AND m.sender_id <> auth.uid()
     AND m.created_at > gm.last_read_at
     AND NOT public.is_blocked(auth.uid(), m.sender_id)
   GROUP BY m.group_id, g.name;
$$;

REVOKE EXECUTE ON FUNCTION public.unread_by_group() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unread_by_group() TO authenticated;


-- ============================================================
-- 6. friendships no emitía realtime, así que una solicitud de amistad
-- no encendía el aviso hasta el siguiente refresco.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
END $$;
