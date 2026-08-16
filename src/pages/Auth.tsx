import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useToast } from '@/hooks/use-toast';
import { MapPin } from 'lucide-react';

// Dominios institucionales aceptados. Debe reflejar el trigger
// enforce_tec_email() de la migración; el servidor es la fuente
// de verdad y esto es solo para una mejor UX previa.
const ALLOWED_EMAIL_DOMAINS = ['tec.mx', 'exatec.mx', 'itesm.mx'];

const isTecEmail = (value: string) =>
  ALLOWED_EMAIL_DOMAINS.includes(value.split('@')[1]?.toLowerCase() ?? '');

export default function Auth() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { toast } = useToast();

  // En la app nativa (iOS) el redirect de OAuth de Google no vuelve
  // al webview, así que ofrecemos solo email+contraseña. Además,
  // Apple exige "Sign in with Apple" si se ofrece login social de
  // terceros (guideline 4.8); ocultar Google evita ese requisito.
  const isNative = Capacitor.isNativePlatform();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp && !isTecEmail(email)) {
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

        {/* Google Sign-In — solo en web (ver isNative arriba) */}
        {!isNative && (
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
            {isSignUp && (
              <p className="text-xs text-muted-foreground">{t('auth.emailHint')}</p>
            )}
          </div>
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
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-bold"
          >
            {loading ? t('common.loading') : isSignUp ? t('auth.createAccount') : t('auth.signIn')}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary font-semibold hover:underline"
          >
            {isSignUp ? t('auth.signIn') : t('auth.signUp')}
          </button>
        </p>
      </div>
    </div>
  );
}
