import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { AppShell } from '@/components/layout/AppShell';
import Auth from '@/pages/Auth';

// Rutas cargadas bajo demanda: mantienen el bundle inicial pequeño
// (importante en móvil). Auth se queda eager porque es el primer
// paint para usuarios sin sesión.
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const MapHome = lazy(() => import('@/pages/MapHome'));
const MyEvents = lazy(() => import('@/pages/MyEvents'));
const Friends = lazy(() => import('@/pages/Friends'));
const Profile = lazy(() => import('@/pages/Profile'));
const GroupChat = lazy(() => import('@/pages/GroupChat'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AuthGate() {
  const { user, session, profile, profileLoaded, loading, setSession, setLoading, fetchProfile } = useAuthStore();

  useEffect(() => {
    // Set up auth listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setSession, setLoading]);

  // Fetch profile when user changes
  useEffect(() => {
    if (user) fetchProfile();
  }, [user, fetchProfile]);

  if (loading) return <PageSpinner />;

  if (!session) return <Auth />;

  // Esperar al perfil antes de decidir. Sin esto, con el perfil todavía sin
  // cargar se entraba a la app —montando el mapa entero, mapbox incluido— y un
  // instante después saltaba a onboarding.
  if (!profileLoaded) return <PageSpinner />;

  if (profile && !profile.onboarding_completed) return <Onboarding />;

  return (
    <AppShell />
  );
}

const App = () => (
  <TooltipProvider>
    <Toaster />
    <BrowserRouter>
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/*" element={<AuthGate />}>
            <Route index element={<MapHome />} />
            <Route path="events" element={<MyEvents />} />
            <Route path="friends" element={<Friends />} />
            <Route path="groups/:id" element={<GroupChat />} />
            <Route path="profile" element={<Profile />} />
            {/* Dentro de AuthGate a propósito: la ruta padre es "/*" y captura
                todo, así que un "*" hermano nunca llegaba a evaluarse y una URL
                desconocida dejaba el Outlet vacío — pantalla en blanco con la
                barra de abajo. */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
