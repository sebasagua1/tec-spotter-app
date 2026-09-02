import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUserLocation } from '@/hooks/useUserLocation';

// El fallo que fijan estos tests: la app avisaba "ubicacion denegada" con la
// ubicacion funcionando.
//
// Habia dos fuentes de verdad. Dentro del WKWebView de Capacitor,
// `navigator.permissions` responde por el origen capacitor://localhost, que no
// tiene nada que ver con la autorizacion nativa de CoreLocation que gobierna a
// `watchPosition`: puede decir `denied` mientras el GPS entrega posiciones. Y
// su `onchange` llegaba tarde y pisaba el `granted` que habia puesto una
// posicion real.
//
// La regla que queda: el sondeo solo puede ADELANTAR un granted. Denegado lo
// declara unicamente el error del propio geolocation.

const POSICION = {
  coords: { longitude: -100.3, latitude: 20.6, accuracy: 12, heading: null, speed: null },
  timestamp: 1_700_000_000_000,
};

let alExito: ((p: unknown) => void) | null = null;
let alError: ((e: unknown) => void) | null = null;
let cambiarSondeo: (() => void) | null = null;
let estadoSondeo = 'prompt';

const errorGeo = (code: number) => ({ code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });

beforeEach(() => {
  alExito = null; alError = null; cambiarSondeo = null; estadoSondeo = 'prompt';
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (ok: (p: unknown) => void, ko: (e: unknown) => void) => { alExito = ok; alError = ko; return 1; },
      clearWatch: vi.fn(),
    },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: async () => {
        const res = { get state() { return estadoSondeo; }, onchange: null as null | (() => void) };
        cambiarSondeo = () => res.onchange?.();
        return res;
      },
    },
  });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('useUserLocation: quién decide que el permiso está denegado', () => {
  it('el sondeo NO puede declarar denegado, aunque lo diga', async () => {
    estadoSondeo = 'denied';
    const { result } = renderHook(() => useUserLocation());
    // Se le da tiempo a que el sondeo resuelva y aplique lo que quiera.
    await waitFor(() => expect(result.current.permission).not.toBe('denied'));
    expect(result.current.permission).toBe('prompt');
  });

  it('con el sondeo diciendo denegado, una posición real manda', async () => {
    estadoSondeo = 'denied';
    const { result } = renderHook(() => useUserLocation());
    await act(async () => { alExito!(POSICION); });
    expect(result.current.permission).toBe('granted');
    expect(result.current.location?.lat).toBe(20.6);
  });

  it('el onchange tardío ya no pisa el granted de una posición real', async () => {
    const { result } = renderHook(() => useUserLocation());
    await act(async () => { alExito!(POSICION); });
    expect(result.current.permission).toBe('granted');

    // Esto es lo que rompía: el sondeo cambiando a denied DESPUÉS de que el
    // GPS ya hubiera entregado posición.
    estadoSondeo = 'denied';
    await act(async () => { cambiarSondeo?.(); });
    expect(result.current.permission).toBe('granted');
    expect(result.current.location).not.toBeNull();
  });

  it('un PERMISSION_DENIED de verdad sí lo declara denegado', async () => {
    const { result } = renderHook(() => useUserLocation());
    await act(async () => { alError!(errorGeo(1)); });
    expect(result.current.permission).toBe('denied');
  });

  it('otros errores del GPS no son una denegación', async () => {
    const { result } = renderHook(() => useUserLocation());
    await act(async () => { alError!(errorGeo(3)); }); // TIMEOUT
    expect(result.current.permission).not.toBe('denied');
    expect(result.current.error?.code).toBe(3);
  });

  it('sin geolocation en el navegador, queda como no soportado', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    const { result } = renderHook(() => useUserLocation());
    await waitFor(() => expect(result.current.permission).toBe('unsupported'));
  });
});
