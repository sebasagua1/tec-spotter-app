import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Enlaces profundos y salto desde una notificación.
 *
 * Dos entradas, un solo destino: convertir algo que viene de FUERA de la app
 * en una ruta interna. Por eso todo pasa por una lista blanca en vez de
 * navegar a lo que llegue — un enlace lo escribe quien quiera.
 *
 * Solo funciona en nativo. En web, `appUrlOpen` no existe y las rutas ya las
 * resuelve el navegador.
 */

const isNative = Capacitor.isNativePlatform();

/** Declarado en ios/App/App/Info.plist como CFBundleURLSchemes. */
export const APP_URL_SCHEME = 'alwaysconnected';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rutas sin parámetros que la app sabe abrir. Ver las <Route> de App.tsx. */
const STATIC_ROUTES = new Set(['/', '/events', '/friends', '/profile']);

/**
 * Valida un camino contra las rutas reales de la app.
 * Devuelve null para cualquier cosa que no reconozca.
 */
export function routeFromPath(path: string): string | null {
  const clean = '/' + path.replace(/^\/+/, '').split('?')[0].split('#')[0];

  if (STATIC_ROUTES.has(clean)) return clean;

  // El id se comprueba de verdad: sin esto, "/groups/../../algo" sería ruta.
  const group = clean.match(/^\/groups\/([^/]+)$/);
  if (group && UUID.test(group[1])) return clean;

  return null;
}

/**
 * `alwaysconnected://groups/<id>` o `https://<dominio>/groups/<id>`.
 *
 * En un esquema propio el primer segmento cae en `host`, no en `pathname`,
 * así que hay que recomponerlo.
 */
export function routeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === `${APP_URL_SCHEME}:`) {
      return routeFromPath(`${parsed.host}${parsed.pathname}`);
    }
    return routeFromPath(parsed.pathname);
  } catch {
    return null;
  }
}

/**
 * Traduce el `data` de una notificación a la pantalla que la responde.
 *
 * Los tipos los fija supabase/migrations/20260827000000_push-triggers.sql;
 * si añades uno allí, añádelo aquí o la notificación abrirá el mapa.
 */
export function routeFromPushData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  switch (d.type) {
    case 'message':
      return typeof d.group_id === 'string' ? routeFromPath(`/groups/${d.group_id}`) : null;
    case 'friend_request':
      return '/friends';
    // Ambas se atienden desde "Mis eventos": ahí están los que organizas, con
    // sus solicitudes, y los que te han aprobado.
    case 'join_request':
    case 'approval':
      return '/events';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

let navigate: ((route: string) => void) | null = null;
let pendingRoute: string | null = null;

/**
 * Conecta el router. Lo llama un componente de dentro de <BrowserRouter>.
 *
 * Guarda la ruta pendiente porque en un arranque en frío —la app estaba
 * cerrada y se abre tocando la notificación— el evento llega antes de que
 * exista router al que pedirle nada.
 */
export function setDeepLinkNavigator(fn: ((route: string) => void) | null): void {
  navigate = fn;
  if (fn && pendingRoute) {
    const route = pendingRoute;
    pendingRoute = null;
    fn(route);
  }
}

function go(route: string | null): void {
  if (!route) return;
  if (navigate) navigate(route);
  else pendingRoute = route;
}

let started = false;

/** Idempotente: se llama en cada arranque con sesión, como registerPush. */
export async function initDeepLinks(): Promise<void> {
  if (!isNative || started) return;
  started = true;

  try {
    await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      go(routeFromUrl(url));
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      go(routeFromPushData(action.notification?.data));
    });

    // Si la app se abrió DESDE un enlace, ese appUrlOpen ya pasó sin oyente.
    const launch = await CapacitorApp.getLaunchUrl();
    if (launch?.url) go(routeFromUrl(launch.url));
  } catch (err) {
    // Que un enlace no abra la pantalla correcta no debe tumbar el arranque.
    console.error('initDeepLinks:', err);
  }
}
