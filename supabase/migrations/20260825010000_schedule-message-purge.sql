-- ============================================================
-- Programar la limpieza de mensajes caducados.
--
-- Va en su propio script a propósito: el SQL Editor ejecuta cada uno
-- dentro de una transacción, y si CREATE EXTENSION pg_cron fallara
-- —porque la extensión no esté disponible en el plan— se llevaría por
-- delante todo lo demás del script. Separado, un fallo aquí no toca ni
-- el arreglo de la carrera de aforo ni el trigger de caducidad.
--
-- Si esto falla, no pasa nada grave: los mensajes se marcan igual con su
-- fecha de caducidad y basta con llamar a purge_expired_messages() a
-- mano de vez en cuando, o programarlo desde Database → Cron Jobs en el
-- panel de Supabase.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- unschedule falla si el trabajo no existe, de ahí el envoltorio.
DO $$
BEGIN
  PERFORM cron.unschedule('purge-expired-messages');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'purge-expired-messages',
  '17 4 * * *',                       -- 04:17 cada día, fuera de horas punta
  $$SELECT public.purge_expired_messages()$$
);

-- Comprobación: debe salir una fila con el horario.
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'purge-expired-messages';
