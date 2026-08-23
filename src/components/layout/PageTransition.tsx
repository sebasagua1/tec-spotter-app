import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigationType, type NavigationType } from 'react-router-dom';

/**
 * Transición entre pantallas.
 *
 * Tres movimientos, según lo que esté pasando:
 *   · Entre pestañas → fundido. Es lo que hace iOS: las pestañas son sitios
 *     paralelos, no un camino, así que deslizarlas sugeriría una dirección
 *     que no existe.
 *   · Al abrir un detalle (el chat) → entra desde la derecha.
 *   · Al volver atrás → entra desde la izquierda.
 *
 * El fundido no lleva transform a propósito (ver el comentario de index.css):
 * la app tiene siete hojas y modales `position: fixed`, y un transform en un
 * ancestro los dejaría posicionados contra este contenedor, que no tiene alto
 * propio. Por eso el único caso con transform es el deslizamiento, y la clase
 * se quita en cuanto termina.
 */

/** Las cuatro pestañas de la barra inferior. */
const TAB_PATHS = new Set(['/', '/events', '/friends', '/profile']);

type Variant = 'fade' | 'forward' | 'back';

const CLASS_FOR: Record<Variant, string> = {
  fade: 'animate-page-fade',
  forward: 'animate-page-forward',
  back: 'animate-page-back',
};

function pickVariant(
  pathname: string,
  navigationType: NavigationType,
  isFirstRender: boolean,
): Variant {
  // Al abrir la app el tipo de navegación ya es 'POP'. Sin esta salida, lo
  // primero que se ve es un deslizamiento hacia atrás desde una pantalla
  // que no existió nunca.
  if (isFirstRender) return 'fade';
  if (navigationType === 'POP') return 'back';
  return TAB_PATHS.has(pathname) ? 'fade' : 'forward';
}

export function PageTransition() {
  const location = useLocation();
  const navigationType = useNavigationType();

  const firstRender = useRef(true);
  useEffect(() => {
    firstRender.current = false;
  }, []);

  return (
    // key: cada ruta monta su propio contenedor, así que la animación
    // arranca sola en cada navegación sin necesidad de efectos.
    <AnimatedPage
      key={location.pathname}
      variant={pickVariant(location.pathname, navigationType, firstRender.current)}
    >
      <Outlet />
    </AnimatedPage>
  );
}

function AnimatedPage({ variant, children }: { variant: Variant; children: ReactNode }) {
  const [animating, setAnimating] = useState(true);

  return (
    <div
      className={animating ? CLASS_FOR[variant] : undefined}
      onAnimationEnd={(e) => {
        // Solo la animación de ESTE div. Sin la comprobación, cualquier
        // animación de dentro —una hoja que sube, un globo que aparece—
        // quitaría la clase antes de tiempo al burbujear, y con ella el
        // transform a mitad de camino.
        if (e.target === e.currentTarget) setAnimating(false);
      }}
    >
      {children}
    </div>
  );
}
