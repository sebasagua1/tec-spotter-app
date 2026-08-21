import { useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';

/**
 * Mantiene al día los contadores de la barra inferior. Se monta una sola vez
 * (AppShell): si cada pantalla montara su propia suscripción acabaríamos con
 * cuatro canales pidiendo lo mismo.
 */
export function useNotificationSync() {
  const { user } = useAuthStore();
  const setCounts = useNotificationStore((s) => s.setCounts);
  const reset = useNotificationStore((s) => s.reset);
  const setRefresh = useNotificationStore((s) => s.setRefresh);

  const refresh = useCallback(async () => {
    if (!user) return;
    // La RPC devuelve una sola fila con los tres números; contarlos desde el
    // cliente exigiría leer filas que la RLS no deja ver (las solicitudes de
    // mis eventos incluyen a gente cuyo perfil no puedo listar).
    const { data, error } = await supabase.rpc('notification_counts');
    if (error) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    setCounts({
      joinRequests: Number(row.join_requests ?? 0),
      friendRequests: Number(row.friend_requests ?? 0),
      unreadMessages: Number(row.unread_messages ?? 0),
      approvals: Number(row.approvals ?? 0),
    });
  }, [user, setCounts]);

  useEffect(() => { setRefresh(refresh); }, [refresh, setRefresh]);

  useEffect(() => {
    if (!user) {
      reset();
      return;
    }

    refresh();

    // Un cambio suele traer varios eventos seguidos (aprobar una solicitud
    // toca event_participants y events). Se agrupan para no lanzar una RPC
    // por cada uno.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    };

    const channel = supabase
      .channel('notification-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleRefresh)
      .subscribe();

    // Volver a la app tras un rato en segundo plano: el websocket pudo
    // caerse y perderse eventos por el camino.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [user, refresh, reset]);

  return refresh;
}
