import { useEffect, useRef, useState } from 'react';

export type GeoPermissionStatus = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface UserLocation {
  lng: number;
  lat: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

interface Options {
  enabled?: boolean;
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
}

/**
 * Continuously tracks the user's geolocation using navigator.geolocation.watchPosition.
 * Optimized for mobile: high-accuracy GPS, throttled updates via maximumAge.
 */
export function useUserLocation(options: Options = {}) {
  const {
    enabled = true,
    enableHighAccuracy = true,
    maximumAge = 5000,
    timeout = 15000,
  } = options;

  const [location, setLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [permission, setPermission] = useState<GeoPermissionStatus>('prompt');
  const watchIdRef = useRef<number | null>(null);
  // El GPS de alta precisión no tiene por qué seguir encendido con la pantalla
  // tapada o la pestaña en segundo plano. En iOS el webview se suspende solo,
  // pero en la web una pestaña de fondo seguiría consumiendo indefinidamente.
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  useEffect(() => {
    const alCambiar = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  /**
   * Si el propio geolocation ya se ha pronunciado, en un sentido o en otro.
   *
   * A partir de ahí su palabra es la única que vale y el sondeo deja de tocar
   * nada: es lo observado contra lo que otra capa opina.
   */
  const decididoPorGeoRef = useRef(false);

  // Sondeo del estado del permiso.
  //
  // OJO con lo que este sondeo vale y lo que NO vale. Dentro del WKWebView de
  // Capacitor, `navigator.permissions` responde por el origen de la página
  // (capacitor://localhost), que no tiene nada que ver con la autorización
  // nativa de CoreLocation que sí gobierna a `watchPosition`. Puede decir
  // `denied` mientras el GPS está entregando posiciones sin problema.
  //
  // Por eso este sondeo NUNCA declara denegado. Solo sirve para adelantar un
  // `granted` y ahorrarse la espera. Quien decide que algo está denegado es
  // el error PERMISSION_DENIED del propio geolocation, que es el único que
  // habla con el sistema operativo.
  useEffect(() => {
    if (!navigator.geolocation) {
      setPermission('unsupported');
      return;
    }
    if (!('permissions' in navigator) || !navigator.permissions?.query) return;

    let cancelado = false;
    const aplicar = (estado: string) => {
      if (cancelado) return;
      // En cuanto geolocation ha dicho algo, el sondeo se calla. Sin esto, su
      // promesa resolvía DESPUÉS de un PERMISSION_DENIED real y devolvía el
      // estado a `prompt`, tapando una denegación de verdad.
      if (decididoPorGeoRef.current) return;
      // Y lo único que puede aportar es adelantar un `granted`. `denied` se
      // ignora siempre —miente dentro del webview— y `prompt` ya es el valor
      // inicial, así que no añade nada.
      if (estado === 'granted') setPermission('granted');
    };

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((res) => {
        aplicar(res.state);
        res.onchange = () => aplicar(res.state);
      })
      // En WebKit 'geolocation' no siempre es un nombre válido y la promesa
      // se rechaza. No es un fallo: simplemente no hay sondeo.
      .catch(() => {});

    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    // Al ocultarse, la limpieza de este efecto llama a clearWatch; al volver,
    // se vuelve a suscribir y la primera lectura llega en unos segundos.
    if (!enabled || !visible) return;
    if (!navigator.geolocation) {
      setPermission('unsupported');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        decididoPorGeoRef.current = true;
        setPermission('granted');
        setLocation({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        setError(err);
        if (err.code === err.PERMISSION_DENIED) {
          decididoPorGeoRef.current = true;
          setPermission('denied');
        }
      },
      { enableHighAccuracy, maximumAge, timeout }
    );

    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, visible, enableHighAccuracy, maximumAge, timeout]);

  return { location, error, permission };
}
