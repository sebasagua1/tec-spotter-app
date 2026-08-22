import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { watchColorScheme, applyColorScheme, prefersDark } from '@/lib/theme';

/**
 * El modo oscuro no se puede comprobar con el emulador del navegador: al
 * cambiar el esquema por DevTools, matchMedia().matches cambia pero el
 * evento 'change' no se emite, así que no prueba nada. Estas pruebas
 * mueven el sistema a mano.
 */

type Handler = (e: MediaQueryListEvent) => void;

function stubMatchMedia(initial: boolean) {
  const handlers = new Set<Handler>();
  let matches = initial;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (media: string) => ({
      get matches() { return matches; },
      media,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, h: Handler) => { handlers.add(h); },
      removeEventListener: (_: string, h: Handler) => { handlers.delete(h); },
      dispatchEvent: () => true,
    }),
  });

  return {
    /** El sistema cambia y avisa (lo normal con la app en primer plano). */
    emit(dark: boolean) {
      matches = dark;
      handlers.forEach((h) => h({ matches: dark } as MediaQueryListEvent));
    },
    /** El sistema cambia SIN avisar (app suspendida en segundo plano). */
    setSilently(dark: boolean) { matches = dark; },
    get listenerCount() { return handlers.size; },
  };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

describe('modo oscuro', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    setHidden(false);
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it('enciende la clase si el sistema arranca en oscuro', () => {
    stubMatchMedia(true);
    stop = watchColorScheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('la deja apagada si el sistema arranca en claro', () => {
    stubMatchMedia(false);
    stop = watchColorScheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('sigue al sistema cuando cambia con la app abierta', () => {
    const mq = stubMatchMedia(false);
    stop = watchColorScheme();

    mq.emit(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    mq.emit(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('se pone al día al volver a primer plano, aunque no haya llegado el evento', () => {
    const mq = stubMatchMedia(false);
    stop = watchColorScheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // El caso real en iOS: el sistema pasa a oscuro con la app guardada.
    mq.setSilently(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('no toca nada mientras la app está oculta', () => {
    const mq = stubMatchMedia(false);
    stop = watchColorScheme();

    mq.setSilently(true);
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('al parar, deja de escuchar por las dos vías', () => {
    const mq = stubMatchMedia(false);
    const cleanup = watchColorScheme();
    expect(mq.listenerCount).toBe(1);

    cleanup();
    expect(mq.listenerCount).toBe(0);

    mq.setSilently(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('prefersDark y applyColorScheme funcionan por separado', () => {
    stubMatchMedia(true);
    expect(prefersDark()).toBe(true);

    applyColorScheme(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyColorScheme(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
