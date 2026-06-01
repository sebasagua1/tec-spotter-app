import { Map, CalendarDays, Users, UserCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border safe-bottom">
      <div className="mx-auto max-w-[430px] flex items-center justify-around h-16">
        {tabs.map(({ path, icon: Icon, key }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-4 py-2 min-w-[64px] transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold">{t(`bottomNav.${key}`)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
