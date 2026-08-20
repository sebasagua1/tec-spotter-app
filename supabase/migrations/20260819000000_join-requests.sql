-- ============================================================
-- Eventos privados con aprobación ("pedir unirme").
--
-- Reglas:
--   privacy = 'open'    → lo ve todo el mundo, entras directo.
--   privacy = 'friends' → solo lo ven los amigos del creador, entran directo.
--   privacy = 'private' → lo ve todo el mundo, pero unirse requiere que el
--                         creador apruebe. La solicitud queda como 'pending'.
--
-- El status NO lo decide el cliente: lo fija un trigger según la privacidad
-- del evento, y solo la RPC respond_to_join_request() puede cambiarlo.
-- ============================================================


-- ============================================================
-- 1. is_event_participant() ahora exige status = 'joined'.
--
-- CRÍTICO para que la aprobación signifique algo. Esta función gobierna
-- quién lee el chat del evento (política de messages) y quién ve la lista
-- de asistentes (política de event_participants). Sin el filtro, bastaba
-- con PEDIR unirse para entrar al chat y ver quién va, sin que nadie
-- aprobara nada.
--
-- Hasta ahora todas las filas eran 'joined', así que el filtro no cambia
-- nada del comportamiento existente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_event_participant(_event_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_participants
    WHERE event_id = _event_id
      AND user_id  = _user_id
      AND status   = 'joined'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_event_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_event_participant(uuid, uuid) TO authenticated;


-- ============================================================
-- 2. Los eventos privados se ven; lo que se restringe es entrar.
--
-- Antes 'private' significaba "solo lo ve el creador", así que nadie
-- podía siquiera encontrarlo para pedir unirse.
-- ============================================================
DROP POLICY IF EXISTS "Events visibility policy" ON public.events;

CREATE POLICY "Events visibility policy"
  ON public.events FOR SELECT TO authenticated
  USING (
    NOT public.is_blocked(auth.uid(), creator_id)
    AND (
      privacy IN ('open', 'private')
      OR creator_id = auth.uid()
      OR (privacy = 'friends' AND public.are_friends(creator_id, auth.uid()))
    )
  );


-- ============================================================
-- 3. El status de entrada lo fija el servidor, no el cliente.
--
-- Sin esto, cualquiera podría insertar status='joined' directamente en un
-- evento privado y saltarse la aprobación por completo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_participant_initial_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privacy    text;
  v_creator_id uuid;
BEGIN
  SELECT privacy, creator_id INTO v_privacy, v_creator_id
  FROM public.events WHERE id = NEW.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Las escrituras del servidor (RPC SECURITY DEFINER, service_role) pasan
  -- tal cual; solo se normaliza lo que llega del cliente.
  IF current_user = 'authenticated' THEN
    IF v_privacy = 'private' AND NEW.user_id <> v_creator_id THEN
      NEW.status := 'pending';
    ELSE
      NEW.status := 'joined';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_participant_initial_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_participant_initial_status ON public.event_participants;
CREATE TRIGGER trg_set_participant_initial_status
  BEFORE INSERT ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_participant_initial_status();


-- ============================================================
-- 4. Nadie se auto-aprueba.
--
-- La política de UPDATE deja a cada quien modificar su propia fila, lo que
-- incluiría cambiar 'pending' → 'joined'. Este trigger lo impide: el status
-- solo lo mueve respond_to_join_request(), que corre como postgres.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_status_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'permission denied: solo el organizador puede aprobar o rechazar'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_status_tampering() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_status_tampering ON public.event_participants;
CREATE TRIGGER trg_prevent_status_tampering
  BEFORE UPDATE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_status_tampering();


-- ============================================================
-- 5. Aprobar suma plazas, puntos, reputación e insignias.
--
-- Los triggers existentes solo escuchaban INSERT, así que al aprobar una
-- solicitud (que es un UPDATE) no se recalculaban las plazas ni se daban
-- los puntos de la incorporación.
-- ============================================================
DROP TRIGGER IF EXISTS trg_recalc_spots_update ON public.event_participants;
CREATE TRIGGER trg_recalc_spots_update
  AFTER UPDATE OF status ON public.event_participants
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.recalc_event_spots();

-- award_points es idempotente (UNIQUE en point_events), así que puede
-- dispararse de más sin duplicar nada.
DROP TRIGGER IF EXISTS trg_on_participant_join_award_update ON public.event_participants;
CREATE TRIGGER trg_on_participant_join_award_update
  AFTER UPDATE OF status ON public.event_participants
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'joined' AND NEW.status = 'joined')
  EXECUTE FUNCTION public.on_participant_join_award();

-- award_reputation SUMA, no es idempotente: el WHEN acota el disparo a la
-- transición real hacia 'joined' para no regalar reputación repetida.
DROP TRIGGER IF EXISTS trg_participant_creator_rep_update ON public.event_participants;
CREATE TRIGGER trg_participant_creator_rep_update
  AFTER UPDATE OF status ON public.event_participants
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'joined' AND NEW.status = 'joined')
  EXECUTE FUNCTION public.on_participant_creator_rep();

DROP TRIGGER IF EXISTS trg_badge_check_on_participant_status ON public.event_participants;
CREATE TRIGGER trg_badge_check_on_participant_status
  AFTER UPDATE OF status ON public.event_participants
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'joined' AND NEW.status = 'joined')
  EXECUTE FUNCTION public.on_participant_badge_check();


-- ============================================================
-- 6. respond_to_join_request — el organizador aprueba o rechaza.
--
-- Rechazar borra la fila en vez de dejarla en 'declined': así la persona
-- puede volver a pedirlo más adelante (por ejemplo si el evento cambia de
-- hora) en lugar de quedar bloqueada para siempre por el UNIQUE.
-- ============================================================
CREATE OR REPLACE FUNCTION public.respond_to_join_request(
    _event_id uuid,
    _user_id  uuid,
    _approve  boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_event  RECORD;
  v_status text;
  v_count  integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT id, creator_id, max_spots INTO v_event
  FROM public.events WHERE id = _event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.creator_id <> v_uid THEN
    RAISE EXCEPTION 'NOT_THE_ORGANIZER' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status
  FROM public.event_participants
  WHERE event_id = _event_id AND user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'REQUEST_ALREADY_HANDLED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT _approve THEN
    DELETE FROM public.event_participants
    WHERE event_id = _event_id AND user_id = _user_id;
    RETURN;
  END IF;

  -- Bloquea la fila del evento para serializar las aprobaciones: sin esto,
  -- dos aprobaciones simultáneas podrían pasar del aforo.
  PERFORM 1 FROM public.events WHERE id = _event_id FOR UPDATE;

  SELECT COUNT(*) INTO v_count
  FROM public.event_participants
  WHERE event_id = _event_id AND status = 'joined';

  IF v_count >= v_event.max_spots THEN
    RAISE EXCEPTION 'EVENT_FULL' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.event_participants
  SET    status = 'joined'
  WHERE  event_id = _event_id AND user_id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_to_join_request(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.respond_to_join_request(uuid, uuid, boolean) TO authenticated;


-- Búsqueda de solicitudes pendientes por evento.
CREATE INDEX IF NOT EXISTS event_participants_pending_idx
  ON public.event_participants (event_id)
  WHERE status = 'pending';


-- ============================================================
-- OJO — cambio de significado en los eventos 'private' que YA existan.
--
-- Antes de esta migración, privacy='private' quería decir "solo lo ve el
-- creador". A partir de ahora quiere decir "lo ve todo el mundo, pero yo
-- apruebo quién entra". Los eventos privados que ya estuvieran creados
-- pasan a ser visibles para cualquiera.
--
-- Revisa si hay alguno antes de dar por bueno el cambio:
--
--   SELECT id, title, creator_id, starts_at
--   FROM   public.events
--   WHERE  privacy = 'private';
--
-- Si quieres que los antiguos sigan siendo poco visibles, pásalos a
-- 'friends' (solo los ven los amigos del creador):
--
--   UPDATE public.events SET privacy = 'friends'
--   WHERE  privacy = 'private' AND created_at < now();
-- ============================================================
