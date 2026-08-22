-- ============================================================
-- Índices en las columnas por las que más se filtra.
--
-- La base tenía tres índices en total. Descontando los que ya crean las
-- restricciones UNIQUE, las columnas de abajo se recorrían enteras en
-- cada consulta. Lo que lo hace urgente es notification_counts(): las
-- toca todas y se dispara con cada cambio en tiempo real, así que cada
-- mensaje enviado provocaba varios escaneos secuenciales.
--
-- Sin CONCURRENTLY a propósito: el SQL Editor ejecuta el script dentro
-- de una transacción y CREATE INDEX CONCURRENTLY no puede correr ahí.
-- Con el tamaño actual de las tablas el bloqueo es de milisegundos.
-- ============================================================


-- Mis eventos, estadísticas del perfil, y los contadores de mensajes y
-- aprobaciones. La UNIQUE (event_id, user_id) ya cubre event_id, pero no
-- sirve para buscar por user_id.
CREATE INDEX IF NOT EXISTS event_participants_user_id_idx
  ON public.event_participants (user_id);

-- Los avisos de "te aprobaron". Parcial porque approval_seen es true en
-- casi todas las filas: el índice queda diminuto y solo lista lo pendiente.
CREATE INDEX IF NOT EXISTS event_participants_unseen_approval_idx
  ON public.event_participants (user_id)
  WHERE approval_seen = false;

-- Eventos que organizo: Mis eventos, el panel de solicitudes y el
-- contador de solicitudes pendientes.
CREATE INDEX IF NOT EXISTS events_creator_id_idx
  ON public.events (creator_id);

-- Solicitudes de amistad recibidas. Compuesto con status porque el
-- contador filtra por las dos columnas a la vez, y la UNIQUE existente
-- empieza por requester_id, que no ayuda aquí.
CREATE INDEX IF NOT EXISTS friendships_addressee_status_idx
  ON public.friendships (addressee_id, status);

-- Mis chats. La UNIQUE (group_id, user_id) cubre group_id, no user_id.
CREATE INDEX IF NOT EXISTS group_members_user_id_idx
  ON public.group_members (user_id);

-- Mensajes sin leer: el contador excluye los propios comparando sender_id.
CREATE INDEX IF NOT EXISTS messages_sender_id_idx
  ON public.messages (sender_id);


-- ============================================================
-- Comprobación (se ejecuta y devuelve filas): los seis deben aparecer.
-- ============================================================
SELECT tablename, indexname
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  indexname IN (
    'event_participants_user_id_idx',
    'event_participants_unseen_approval_idx',
    'events_creator_id_idx',
    'friendships_addressee_status_idx',
    'group_members_user_id_idx',
    'messages_sender_id_idx'
  )
ORDER  BY tablename, indexname;
