import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

/**
 * Registro del dispositivo para notificaciones push.
 *
 * Solo corre en nativo: en el navegador el plugin no existe y las push web
 * son otra tecnología (VAPID), que no es lo que estamos montando.
 */

const isNative = Capacitor.isNativePlatform();

/** Se guarda para poder darlo de baja al cerrar sesión. */
let currentToken: string | null = null;

let listenersReady = false;

/**
 * Pide permiso y registra el dispositivo. Idempotente: APNs rota los tokens
 * por su cuenta, así que esto se llama en cada arranque con sesión abierta.
 */
export async function registerPush(): Promise<void> {
  if (!isNative) return;

  try {
    // checkPermissions primero: si ya se concedió, no se vuelve a preguntar,
    // y si el usuario lo denegó una vez, iOS ya no muestra el diálogo — pedirlo
    // otra vez no molesta pero tampoco sirve.
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') return;

    if (!listenersReady) {
      listenersReady = true;

      await PushNotifications.addListener('registration', async (token) => {
        currentToken = token.value;
        const { error } = await supabase.rpc('register_device_token', {
          _token: token.value,
          _platform: 'ios',
        });
        if (error) console.error('register_device_token:', error.message);
      });

      await PushNotifications.addListener('registrationError', (err) => {
        // Lo más común aquí es que falte la capacidad Push Notifications en el
        // perfil de aprovisionamiento.
        console.error('Fallo al registrar en APNs:', JSON.stringify(err));
      });
    }

    await PushNotifications.register();
  } catch (err) {
    console.error('registerPush:', err);
  }
}

/**
 * Baja del dispositivo. Sin esto, el teléfono seguiría recibiendo
 * notificaciones de la cuenta que acaba de cerrar sesión.
 */
export async function unregisterPush(): Promise<void> {
  if (!isNative || !currentToken) return;
  const token = currentToken;
  currentToken = null;
  const { error } = await supabase.rpc('unregister_device_token', { _token: token });
  if (error) console.error('unregister_device_token:', error.message);
}
