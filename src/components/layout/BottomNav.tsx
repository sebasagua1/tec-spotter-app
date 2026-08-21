import { Map, CalendarDays, Users, UserCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useNotificationStore } from '@/stores/notificationStore';

const tabs = [
  { path: '/', icon: Map, key: 'map' as const },
  { path: '/events', icon: CalendarDays, key: 'events' as const },
  { path: '/friends', icon: Users, key: 'friends' as const },
  { path: '/profile', icon: UserCircle, key: 'profile' as const },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { joinRequests, friendRequests, unreadMessages } = useNotificationStore();

  // Amigos concentra dos cosas que esperan respuesta: quien te ha agregado y
  // quien te ha escrito.
  const badges: Record<string, number> = {
    '/events': joinRequests,
    '/friends': friendRequests + unreadMessages,
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border safe-bottom">
      <div className="mx-auto max-w-[430px] flex items-center justify-around h-16">
        {tabs.map(({ path, icon: Icon, key }) => {
          const active = location.pathname === path;
          const count = badges[path] ?? 0;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-4 py-2 min-w-[64px] transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <span className="relative">
                <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 1.8} />
                {count > 0 && (
                  <span
                    aria-label={t('notifications.pending', { count })}
                    className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
                  >
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold">{t(`bottomNav.${key}`)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
