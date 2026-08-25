-- ============================================================
-- Índice para la consulta principal del mapa.
--
-- MapHome pide siempre lo mismo:
--
--     select * from events where is_active and ends_at > now()
--
-- y hasta ahora eso era un recorrido secuencial de la tabla entera. Los
-- índices que había son de creator_id e institution_id, que no sirven aquí.
--
-- Parcial sobre is_active en vez de un compuesto (is_active, ends_at): la
-- inmensa mayoría de las filas tienen is_active = true, así que el índice
-- pesa prácticamente lo mismo, pero se ahorra la columna y deja fuera los
-- eventos cancelados, que es justo lo que la consulta nunca quiere.
--
-- Sobre ends_at y no sobre starts_at: la condición es un rango sobre
-- ends_at, así que el índice se posiciona en now() y recorre hacia
-- adelante. Los eventos ya pasados se quedan detrás del punto de entrada
-- sin llegar a leerse, que es lo que hace que esto siga funcionando
-- cuando la tabla acumule años de eventos viejos.
--
-- Sin CONCURRENTLY a propósito, por lo mismo que en 20260824000000: el SQL
-- Editor ejecuta el script dentro de una transacción y CREATE INDEX
-- CONCURRENTLY no puede correr ahí. Con el tamaño actual de la tabla el
-- bloqueo es de milisegundos.
--
-- Idempotente: re-ejecutarlo no hace nada.
-- ============================================================

CREATE INDEX IF NOT EXISTS events_active_ends_idx
  ON public.events (ends_at)
  WHERE is_active;

-- ============================================================
-- Comprobación (devuelve una fila si ha ido bien).
-- ============================================================
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  indexname  = 'events_active_ends_idx';
