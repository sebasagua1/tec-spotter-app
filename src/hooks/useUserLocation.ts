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

  // Probe permission state when available
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }
    if ('permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((res) => {
          setPermission(res.state as GeoPermissionStatus);
          res.onchange = () => setPermission(res.state as GeoPermissionStatus);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    // Al ocultarse, la limpieza de este efecto llama a clearWatch; al volver,
    // se vuelve a suscribir y la primera lectura llega en unos segundos.
    if (!enabled || !visible) return;
    if (!('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
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
        if (err.code === err.PERMISSION_DENIED) setPermission('denied');
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
