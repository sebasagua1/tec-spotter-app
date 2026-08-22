import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { unregisterPush } from '@/lib/push';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** false hasta que el primer fetchProfile termina, haya perfil o no. Sin
   *  esto no se puede distinguir "todavía no se ha pedido" de "no hay". */
  profileLoaded: boolean;
  /** El enlace del correo de recuperación abre sesión por su cuenta. Sin esta
   *  bandera el usuario entraría a la app sin llegar a cambiar la contraseña. */
  passwordRecovery: boolean;
  setPasswordRecovery: (v: boolean) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  profileLoaded: false,
  // Se decide antes del primer render: supabase-js consume el hash de la URL
  // al arrancar, y para entonces el evento PASSWORD_RECOVERY puede haber
  // pasado ya sin que nadie escuchara.
  passwordRecovery:
    typeof window !== 'undefined' && window.location.hash.includes('type=recovery'),
  setPasswordRecovery: (passwordRecovery) => set({ passwordRecovery }),
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  signOut: async () => {
    // Antes del signOut: dar de baja el token necesita la sesión todavía viva.
    await unregisterPush();
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null, profileLoaded: false, passwordRecovery: false });
  },
  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    // Aquí no hay toast (esto es un store, no un componente). Se registra
    // porque un fallo deja al usuario sin perfil y el síntoma —volver al
    // onboarding— no apunta a la causa.
    if (error) console.error('fetchProfile falló:', error.message);
    // profileLoaded se marca pase lo que pase: si el perfil no existe (por
    // ejemplo si falló el trigger que lo crea), quedarse esperando dejaría la
    // app colgada en el spinner para siempre.
    set(data ? { profile: data, profileLoaded: true } : { profileLoaded: true });
  },
}));
