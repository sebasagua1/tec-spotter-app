/**
 * Modo oscuro: sigue la preferencia del sistema, sin ajuste propio.
 *
 * El estado INICIAL no se pone aquí sino en un script en línea del
 * index.html. Los módulos van diferidos, así que para cuando este código
 * corre el navegador ya ha pintado el fondo claro: se vería un fogonazo
 * blanco al abrir la app de noche. Lo de aquí es solo lo que aquel script
 * no puede hacer — enterarse de los cambios en vivo, que en un móvil
 * pasan solos al anochecer si el sistema está en automático.
 */

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Si el sistema pide oscuro ahora mismo. */
export function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches;
}

/** Enciende o apaga la clase que lee Tailwind (darkMode: ['class']). */
export function applyColorScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
}

/**
 * Avisa cuando el sistema cambia de claro a oscuro o al revés.
 * Devuelve la función para dejar de escuchar.
 */
export function onColorSchemeChange(cb: (dark: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/**
 * Deja la clase sincronizada con el sistema durante toda la vida de la app.
 * Se llama una vez, al arrancar.
 *
 * Escucha por dos vías a propósito. La del media query es la buena, pero en
 * iOS el webview se suspende al irse a segundo plano, y el cambio de tema
 * suele pasar justo ahí: el sistema pasa a oscuro al anochecer con la app
 * guardada, y al volver el evento ya no llega. Por eso se vuelve a mirar
 * cada vez que la pantalla se hace visible.
 */
export function watchColorScheme(): () => void {
  const sync = () => applyColorScheme(prefersDark());

  // Resincroniza por si el script en línea no llegó a correr (por ejemplo
  // si alguien sirve el HTML sin él).
  sync();

  const stopMediaQuery = onColorSchemeChange(applyColorScheme);
  const onVisible = () => { if (!document.hidden) sync(); };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopMediaQuery();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
