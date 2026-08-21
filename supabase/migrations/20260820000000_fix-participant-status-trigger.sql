-- ============================================================
-- ARREGLO CRÍTICO: la aprobación de eventos privados nunca llegaba
-- a activarse. Todo el mundo entraba directo.
--
-- Qué pasaba
--   set_participant_initial_status() se declaró SECURITY DEFINER y
--   además se protegió con `IF current_user = 'authenticated'`. Dentro
--   de una función SECURITY DEFINER current_user es el DUEÑO de la
--   función (postgres), nunca 'authenticated', así que esa condición
--   era siempre falsa y el cuerpo no se ejecutaba jamás.
--
--   El cliente inserta literalmente `status: 'joined'`
--   (EventBottomSheet.tsx, handleJoin). Sin la normalización del
--   trigger, ese 'joined' se guardaba tal cual: en un evento privado
--   quien pulsaba "Pedir unirme" quedaba dentro al instante, con
--   plaza, chat y lista de asistentes, y el panel "Solicitudes (N)"
--   del organizador salía siempre vacío.
--
--   El resto del código del proyecto ya documenta esta regla — ver
--   prevent_score_tampering y prevent_self_checkin en
--   20260604120000, que son SECURITY INVOKER precisamente para que
--   `current_user = 'authenticated'` funcione.
--
-- Arreglo
--   Se quita la condición en vez de quitar SECURITY DEFINER: la
--   función necesita leer public.events sin que la RLS le filtre la
--   fila. La normalización pasa a ser incondicional, que es correcto
--   porque NADA del lado servidor inserta en event_participants
--   (no hay un solo INSERT INTO event_participants en las migraciones;
--   respond_to_join_request solo hace UPDATE, y ese UPDATE no dispara
--   este trigger BEFORE INSERT).
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

  -- El status de entrada lo decide siempre el servidor, venga de donde
  -- venga el INSERT. Lo que mande el cliente se ignora.
  IF v_privacy = 'private' AND NEW.user_id <> v_creator_id THEN
    NEW.status := 'pending';
  ELSE
    NEW.status := 'joined';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_participant_initial_status() FROM PUBLIC, anon, authenticated;

-- El trigger ya existe desde 20260819000000 y apunta a esta misma
-- función; CREATE OR REPLACE basta, no hay que recrearlo.


-- ============================================================
-- OPCIONAL (no se ejecuta): gente que entró en un evento privado sin
-- aprobación por culpa del bug. Míralo antes de tocar nada.
--
--   SELECT e.id, e.title, p.user_id, p.status, p.joined_at
--   FROM   public.event_participants p
--   JOIN   public.events e ON e.id = p.event_id
--   WHERE  e.privacy = 'private'
--     AND  p.user_id <> e.creator_id
--     AND  p.status  = 'joined';
--
-- Para devolverlos a la cola de aprobación (el UPDATE va como postgres
-- desde el SQL Editor, así que prevent_status_tampering no lo bloquea):
--
--   UPDATE public.event_participants p
--   SET    status = 'pending'
--   FROM   public.events e
--   WHERE  e.id = p.event_id
--     AND  e.privacy = 'private'
--     AND  p.user_id <> e.creator_id
--     AND  p.status  = 'joined';
-- ============================================================
