-- ============================================================
-- Límite de creación de eventos
--
-- La política de INSERT sobre events solo comprueba que el creador seas
-- tú (`auth.uid() = creator_id`). No hay nada que impida a un script
-- meter eventos en bucle.
--
-- Lo que lo vuelve urgente es que el mapa pasó a estar acotado a 500
-- eventos (MAX_MAP_EVENTS, migración 20260901000000): con el tope, quien
-- llene esos 500 no satura la app, hace algo peor — desplaza a los
-- eventos reales fuera del mapa SIN que nada indique que faltan.
--
-- Va en un trigger y no dentro de la política porque así se puede
-- devolver un código estable que el cliente traduce (ver rpcErrors.ts);
-- una política que no pasa solo produce el error genérico de RLS.
-- ============================================================

-- Márgenes holgados: son para frenar un bucle, no para estorbar a quien
-- organiza de verdad. Un usuario normal no llega a estos números.
CREATE OR REPLACE FUNCTION public.enforce_event_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
-- DEFINER a propósito: el recuento tiene que ver TODAS las filas del
-- usuario. Con INVOKER, alguien podría esconderse tras la política de
-- visibilidad para que sus propios eventos no se contaran.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_ultima int;
  v_dia    int;
BEGIN
  -- Sin sesión: service_role, semillas y las propias migraciones. No se
  -- les aplica el límite, o el seed de datos de prueba fallaría.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    count(*) FILTER (WHERE created_at > now() - interval '1 hour'),
    count(*) FILTER (WHERE created_at > now() - interval '1 day')
  INTO v_ultima, v_dia
  FROM public.events
  WHERE creator_id = v_uid
    AND created_at > now() - interval '1 day';

  IF v_ultima >= 5 OR v_dia >= 20 THEN
    RAISE EXCEPTION 'EVENT_RATE_LIMIT'
      USING HINT = 'Demasiados eventos creados en poco tiempo.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_event_rate_limit() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_event_rate_limit ON public.events;
CREATE TRIGGER trg_event_rate_limit
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_rate_limit();

-- El recuento filtra por creator_id y luego por fecha. `events_creator_id_idx`
-- (migración 20260824000000) ya lo resuelve: un usuario tiene pocas filas y el
-- rango de un día se descarta en memoria. No hace falta índice nuevo.


-- ============================================================
-- Comprobación (se ejecuta y devuelve filas): debe salir una, con el
-- trigger activo sobre events.
-- ============================================================
SELECT tgname   AS trigger,
       tgenabled AS activo,
       proname  AS funcion
FROM   pg_trigger t
JOIN   pg_proc    p ON p.oid = t.tgfoid
WHERE  t.tgrelid = 'public.events'::regclass
  AND  t.tgname  = 'trg_event_rate_limit';
