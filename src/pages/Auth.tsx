import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useToast } from '@/hooks/use-toast';
import { MapPin } from 'lucide-react';
import { PRIVACY_URL, TERMS_URL, SITE_URL } from '@/lib/legal';
import {
  isNative,
  googleNativeConfigured,
  signInWithAppleNative,
  signInWithGoogleNative,
} from '@/lib/socialAuth';

// Restricción de registro a correos institucionales del Tec.
// APAGADA por defecto: durante pruebas/lanzamiento cualquier correo
// puede registrarse. Para limitar el registro al campus, pon
// VITE_RESTRICT_TEC_EMAIL=true en el entorno Y aplica la migración
// enforce_tec_email en Supabase (el servidor es la fuente de verdad;
// este chequeo de cliente es solo para mejor UX).
const RESTRICT_TEC_EMAIL = import.meta.env.VITE_RESTRICT_TEC_EMAIL === 'true';
const ALLOWED_EMAIL_DOMAINS = ['tec.mx', 'exatec.mx', 'itesm.mx'];

const isTecEmail = (value: string) =>
  ALLOWED_EMAIL_DOMAINS.includes(value.split('@')[1]?.toLowerCase() ?? '');

export default function Auth() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Qué botón social nativo está en curso (Apple/Google en iOS).
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);
  const { toast } = useToast();

  const showError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : t('common.error');
    toast({ title: t('common.error'), description: msg, variant: 'destructive' });
  };

  // Login social NATIVO (iOS): Apple y Google vía plugin → signInWithIdToken.
  // Al tener éxito, onAuthStateChange (App.tsx) actualiza la sesión y navega.
  const handleAppleNative = async () => {
    setSocialLoading('apple');
    try {
      await signInWithAppleNative();
    } catch (err) {
      showError(err);
    } finally {
      setSocialLoading(null);
    }
  };

  const handleGoogleNative = async () => {
    setSocialLoading('google');
    try {
      await signInWithGoogleNative();
    } catch (err) {
      showError(err);
    } finally {
      setSocialLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (forgot) {
      setLoading(true);
      try {
        // redirectTo apunta a la web y no a window.location.origin: dentro del
        // webview de Capacitor el origen es capacitor://localhost, y el enlace
        // del correo se abre en el navegador del sistema, donde eso no existe.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: SITE_URL,
        });
        if (error) throw error;
      } catch (err: unknown) {
        showError(err);
        setLoading(false);
        return;
      }
      // El mismo mensaje exista o no la cuenta: decir "ese correo no está
      // registrado" permitiría averiguar quién tiene cuenta.
      toast({ title: t('auth.resetSent'), description: t('auth.resetSentDesc') });
      setForgot(false);
      setLoading(false);
      return;
    }

    if (isSignUp && RESTRICT_TEC_EMAIL && !isTecEmail(email)) {
      toast({ title: t('common.error'), description: t('auth.tecEmailOnly'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: t('auth.checkEmail'), description: t('auth.verifyLink') });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.error');
      toast({ title: t('common.error'), description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.error');
      toast({ title: t('common.error'), description: msg, variant: 'destructive' });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">
      <div className="absolute top-4 right-4 safe-top">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-[380px] space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto shadow-soft">
            <MapPin className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">ConnectTec</h1>
          <p className="text-muted-foreground text-sm">{t('auth.tagline')}</p>
        </div>

        {/* Login social. En iOS (nativo): Apple + Google vía plugin nativo.
            En web: Google vía OAuth redirect de Supabase. */}
        {isNative ? (
          <>
            <div className="space-y-3">
              {/* Sign in with Apple — requerido por Apple (guideline 4.8) si se ofrece login social */}
              <Button
                type="button"
                onClick={handleAppleNative}
                disabled={socialLoading !== null}
                className="w-full h-12 rounded-xl text-base font-medium bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"/>
                </svg>
                {socialLoading === 'apple' ? t('auth.signingIn') : t('auth.continueApple')}
              </Button>

              {/* Google nativo — solo si los client IDs están configurados */}
              {googleNativeConfigured && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleNative}
                  disabled={socialLoading !== null}
                  className="w-full h-12 rounded-xl text-base font-medium border-border bg-card hover:bg-accent flex items-center justify-center gap-3"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58Z" fill="#EA4335"/>
                  </svg>
                  {socialLoading === 'google' ? t('auth.signingIn') : t('auth.continueGoogle')}
                </Button>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium">{t('auth.or')}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full h-12 rounded-xl text-base font-medium border-border bg-card hover:bg-accent flex items-center justify-center gap-3"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58Z" fill="#EA4335"/>
              </svg>
              {googleLoading ? t('auth.signingIn') : t('auth.continueGoogle')}
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium">{t('auth.or')}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth-email">{t('auth.email')}</Label>
            <Input
              id="auth-email"
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-12 rounded-xl bg-card border-border text-base"
            />
            {isSignUp && RESTRICT_TEC_EMAIL && (
              <p className="text-xs text-muted-foreground">{t('auth.emailHint')}</p>
            )}
          </div>
          {!forgot && (
            <div className="space-y-2">
              <Label htmlFor="auth-password">{t('auth.password')}</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className="h-12 rounded-xl bg-card border-border text-base"
              />
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => setForgot(true)}
                  className="inline-flex items-center self-start min-h-[44px] text-sm text-primary font-semibold hover:underline"
                >
                  {t('auth.forgot')}
                </button>
              )}
            </div>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-bold"
          >
            {loading
              ? t('common.loading')
              : forgot
                ? t('auth.sendResetLink')
                : isSignUp
                  ? t('auth.createAccount')
                  : t('auth.signIn')}
          </Button>
        </form>

        {/* Apple pide que privacidad y términos sean accesibles desde donde
            se crea la cuenta, no solo desde la ficha de la App Store. */}
        <p className="text-center text-sm text-muted-foreground leading-relaxed">
          {t('legal.agreePrefix')}{' '}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="inline-block py-1 text-primary font-semibold hover:underline">
            {t('legal.terms')}
          </a>{' '}
          {t('legal.and')}{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="inline-block py-1 text-primary font-semibold hover:underline">
            {t('legal.privacy')}
          </a>.
        </p>

        <p className="text-center text-sm text-muted-foreground">
          {forgot ? (
            <button
              onClick={() => setForgot(false)}
              className="inline-flex items-center min-h-[44px] px-1 text-primary font-semibold hover:underline"
            >
              {t('auth.backToSignIn')}
            </button>
          ) : (
            <>
              {isSignUp ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="inline-flex items-center min-h-[44px] px-1 text-primary font-semibold hover:underline"
              >
                {isSignUp ? t('auth.signIn') : t('auth.signUp')}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
