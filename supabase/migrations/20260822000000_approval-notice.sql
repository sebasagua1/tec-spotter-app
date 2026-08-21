-- ============================================================
-- Aviso a quien fue aprobado.
--
-- Los contadores de 20260821000000 cuentan lo que te llega: solicitudes
-- y mensajes. Faltaba el sentido contrario — "ya te dejaron entrar" —,
-- que es justo lo que espera quien pidió unirse a un evento privado.
-- ============================================================


-- ============================================================
-- 1. Cuándo se aprobó y si ya lo ha visto.
--
-- approval_seen arranca en true a propósito: así las filas que ya
-- existen (y las de quien entra directo a un evento abierto) no
-- encienden nada. Solo lo pone en false una aprobación de verdad.
-- ============================================================
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS approval_seen boolean NOT NULL DEFAULT true;


-- ============================================================
-- 2. Aprobar deja marca. Igual que antes salvo el UPDATE final.
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
  SET    status        = 'joined',
         approved_at   = now(),
         approval_seen = false
  WHERE  event_id = _event_id AND user_id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_to_join_request(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.respond_to_join_request(uuid, uuid, boolean) TO authenticated;


-- ============================================================
-- 3. Marcar los avisos como vistos, al abrir Mis eventos.
--
-- Por RPC y no por política de UPDATE: event_participants tiene el
-- trigger prevent_status_tampering encima y la fila la comparten dos
-- personas. Esta función solo toca approval_seen y solo de quien llama.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_approvals_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_participants
  SET    approval_seen = true
  WHERE  user_id = auth.uid()
    AND  approval_seen = false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_approvals_seen() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_approvals_seen() TO authenticated;


-- ============================================================
-- 4. El contador gana una cuarta cifra.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notification_counts()
RETURNS TABLE (
  join_requests   bigint,
  friend_requests bigint,
  unread_messages bigint,
  approvals       bigint
)
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

    -- Mensajes posteriores a mi última lectura, sin contar los míos
    (SELECT count(*)
       FROM public.group_members gm
       JOIN public.messages m ON m.group_id = gm.group_id
      WHERE gm.user_id   = auth.uid()
        AND m.sender_id <> auth.uid()
        AND m.created_at > gm.last_read_at
        AND NOT public.is_blocked(auth.uid(), m.sender_id)),

    -- Eventos a los que me han dejado entrar y aún no he visto
    (SELECT count(*)
       FROM public.event_participants p
       JOIN public.events e ON e.id = p.event_id
      WHERE p.user_id = auth.uid()
        AND p.approved_at IS NOT NULL
        AND p.approval_seen = false
        AND e.is_active);
$$;

REVOKE EXECUTE ON FUNCTION public.notification_counts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.notification_counts() TO authenticated;
