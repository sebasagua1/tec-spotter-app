import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppShell() {
  return (
    <div className="mx-auto max-w-[430px] min-h-screen relative bg-background">
      <Outlet />
      <BottomNav />
    </div>
  );
}
