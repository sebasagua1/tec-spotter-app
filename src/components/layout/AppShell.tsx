import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { useNotificationSync } from '@/hooks/useNotificationSync';

export function AppShell() {
  // Una sola suscripción para toda la app: los contadores los comparte el
  // store, así que no hace falta que cada pantalla monte la suya.
  useNotificationSync();

  return (
    <div className="mx-auto sm:max-w-[430px] min-h-screen relative bg-background">
      <Outlet />
      <BottomNav />
    </div>
  );
}
