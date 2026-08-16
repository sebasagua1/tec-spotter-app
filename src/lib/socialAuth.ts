// Social login nativo (iOS) con @capgo/capacitor-social-login → Supabase.
//
// Flujo: el plugin hace el sign-in nativo de Apple/Google y devuelve un
// idToken (JWT). Ese token se canjea con Supabase vía signInWithIdToken,
// que crea/recupera la sesión. Evita el OAuth por redirect (que se rompe
// en el webview de Capacitor).
//
// Config necesaria (ver APP_STORE.md):
// - Apple: capability "Sign in with Apple" en Xcode (usa el entitlement;
//   en iOS nativo NO requiere clientId) + proveedor Apple en Supabase.
// - Google: iOS + Web OAuth Client IDs en Google Cloud, puestos en las
//   env vars de abajo, + proveedor Google en Supabase con esos client IDs
//   como "Authorized Client IDs".
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { supabase } from '@/integrations/supabase/client';

const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;

export const isNative = Capacitor.isNativePlatform();

// El botón de Google nativo solo se muestra si los client IDs están puestos.
// Apple no necesita config extra en iOS (usa el entitlement).
export const googleNativeConfigured = Boolean(GOOGLE_IOS_CLIENT_ID && GOOGLE_WEB_CLIENT_ID);

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = SocialLogin.initialize({
      apple: {}, // iOS usa el entitlement; clientId/redirectUrl son para web/Android
      ...(googleNativeConfigured
        ? { google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID } }
        : {}),
    });
  }
  return initPromise;
}

async function exchangeIdToken(provider: 'apple' | 'google', idToken: string | null) {
  if (!idToken) throw new Error(`No se recibió idToken de ${provider}`);
  const { error } = await supabase.auth.signInWithIdToken({ provider, token: idToken });
  if (error) throw error;
}

export async function signInWithAppleNative(): Promise<void> {
  await ensureInitialized();
  const { result } = await SocialLogin.login({
    provider: 'apple',
    options: { scopes: ['email', 'name'] },
  });
  await exchangeIdToken('apple', result.idToken);
}

export async function signInWithGoogleNative(): Promise<void> {
  await ensureInitialized();
  const { result } = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] },
  });
  await exchangeIdToken('google', result.idToken);
}
