-- ============================================================
-- 1. Carrera de aforo al apuntarse.
--
-- recalc_event_spots() contaba DESPUÉS de insertar y en READ COMMITTED:
-- dos personas apuntándose a la vez podían contar ambas antes de que la
-- otra confirmara, ver hueco las dos, y pasar del máximo.
--
-- El arreglo es bloquear la fila del evento ANTES de contar, que es lo
-- que ya hacía respond_to_join_request() en la ruta de aprobación —esa
-- estaba bien— y que faltaba en la de apuntarse directo.
--
-- Sin riesgo de interbloqueo: las dos rutas piden el mismo lock y en el
-- mismo orden (primero events, luego event_participants), y volver a
-- pedirlo dentro de la misma transacción no bloquea.
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_event_spots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_count    integer;
  v_max      integer;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);

  -- FOR UPDATE serializa: quien llegue segundo espera aquí y cuenta ya
  -- con la fila de la otra persona confirmada.
  SELECT max_spots INTO v_max
  FROM public.events
  WHERE id = v_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- El evento se borró en la misma transacción (cascade); no hay nada
    -- que recalcular.
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.event_participants
  WHERE event_id = v_event_id AND status = 'joined';

  IF TG_OP = 'INSERT' AND v_count > v_max THEN
    RAISE EXCEPTION 'EVENT_FULL' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.events
  SET current_spots = v_count
  WHERE id = v_event_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_event_spots() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2. Caducidad de mensajes.
--
-- messages.expires_at existe desde la primera migración y NADIE la
-- escribía nunca: era NULL en todas las filas. Así que no es que
-- faltara la limpieza, es que no había nada marcado que limpiar, y los
-- chats crecían sin límite junto con el coste de los contadores.
--
-- OJO, esto borra mensajes. Dos propiedades que lo hacen seguro:
--   · Solo afecta a mensajes NUEVOS. Los que ya existen tienen
--     expires_at NULL y la limpieza filtra por "expires_at < now()",
--     así que ninguno de ellos entra jamás.
--   · La ventana es un único número, abajo. Cambiarla es una línea.
-- ============================================================

-- 90 días. Suficiente para que un chat de evento siga siendo útil
-- semanas después, y para que un DM no se evapore en un cuatrimestre.
CREATE OR REPLACE FUNCTION public.set_message_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lo decide el servidor, no el cliente: si no, cualquiera podría
  -- mandar mensajes que no caducan nunca (o que caducan al instante en
  -- la conversación de otro).
  NEW.expires_at := now() + interval '90 days';
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_message_expiry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_message_expiry ON public.messages;
CREATE TRIGGER trg_set_message_expiry
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_message_expiry();


CREATE OR REPLACE FUNCTION public.purge_expired_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.messages
  WHERE expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_expired_messages() FROM PUBLIC, anon, authenticated;

-- La limpieza filtra por fecha, así que conviene tenerla indexada.
-- Parcial: las filas antiguas con NULL no entran en el índice.
CREATE INDEX IF NOT EXISTS messages_expires_at_idx
  ON public.messages (expires_at)
  WHERE expires_at IS NOT NULL;


-- ============================================================
-- Comprobación (devuelve filas): el trigger de caducidad y el lock.
-- ============================================================
SELECT 'trigger de caducidad' AS que,
       COALESCE(max(tgname), 'FALTA')       AS estado
FROM   pg_trigger WHERE tgname = 'trg_set_message_expiry'
UNION ALL
SELECT 'lock en el aforo',
       CASE WHEN pg_get_functiondef(p.oid) LIKE '%FOR UPDATE%'
            THEN 'FOR UPDATE presente' ELSE 'FALTA EL LOCK' END
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.proname = 'recalc_event_spots';
