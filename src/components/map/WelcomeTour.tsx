import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, CalendarDays, Users, UserCircle, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Recorrido de bienvenida, una sola vez por persona.
 *
 * Antes esto era un solo globo apuntando al botón de crear: la mitad de la app
 * (mis eventos, amigos, perfil) quedaba sin presentar y había que descubrirla
 * tocando pestañas a ver qué pasa.
 *
 * Va en un PORTAL a document.body a propósito. Los globos se posicionan con
 * `fixed` para poder anclarse a la barra de navegación, que vive en el
 * AppShell y no aquí, y en esta app hay transiciones que ponen `transform` en
 * ancestros. Un `transform` convierte a sus descendientes `fixed` en hijos
 * suyos, así que el globo se habría colocado respecto al contenedor del mapa y
 * no respecto a la pantalla. El portal esquiva el problema de raíz.
 */

type Paso = {
  clave: string;
  /** Qué se ilumina. Sin ancla, el globo va centrado y sin pico. */
  ancla: string | null;
  icono: typeof Plus;
};

const PASOS: Paso[] = [
  { clave: 'map', ancla: null, icono: MapPin },
  { clave: 'create', ancla: '[data-tour="create"]', icono: Plus },
  { clave: 'events', ancla: '[data-tour="events"]', icono: CalendarDays },
  { clave: 'friends', ancla: '[data-tour="friends"]', icono: Users },
  { clave: 'profile', ancla: '[data-tour="profile"]', icono: UserCircle },
];

/** Aire entre el recuadro iluminado y el borde de lo que ilumina. */
const HOLGURA = 8;
/** Separación entre el globo y el elemento al que apunta. */
const SEPARACION = 14;
const MARGEN = 16;

interface Recuadro { top: number; left: number; width: number; height: number; }

/** Todo lo que hace falta pintar un paso, ya en píxeles. */
interface Medida {
  hueco: Recuadro;
  /** Del globo, respecto a la ventana. */
  tarjetaLeft: number;
  tarjetaBottom: number;
  tarjetaAncho: number;
  /** Del pico, respecto al borde izquierdo del globo. */
  picoLeft: number;
}

const acotar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Coloca el globo encima del ancla y el pico sobre su centro.
 *
 * El globo se acota a la ventana, así que con un ancla muy a un lado deja de
 * estar centrado sobre ella; por eso el pico se calcula aparte y no se da por
 * hecho que caiga en la mitad de la tarjeta.
 */
function medirPaso(el: Element): Medida {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const ancho = Math.min(320, vw - MARGEN * 2);
  const centroX = r.left + r.width / 2;
  const left = acotar(centroX - ancho / 2, MARGEN, Math.max(MARGEN, vw - ancho - MARGEN));
  return {
    hueco: { top: r.top, left: r.left, width: r.width, height: r.height },
    tarjetaLeft: left,
    tarjetaBottom: Math.max(MARGEN, window.innerHeight - r.top + SEPARACION),
    tarjetaAncho: ancho,
    // Sin acotarlo, con un ancla pegada al borde el pico se sale de la tarjeta.
    picoLeft: acotar(centroX - left, 18, ancho - 18),
  };
}

interface Props {
  /** Se llama al terminar o al saltar: en ambos casos el recorrido se da por visto. */
  onFinish: () => void;
}

export function WelcomeTour({ onFinish }: Props) {
  const { t } = useTranslation();
  const [indice, setIndice] = useState(0);
  const [medida, setMedida] = useState<Medida | null>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);

  const paso = PASOS[indice];
  const ultimo = indice === PASOS.length - 1;

  // Medir el ancla. Se repite al cambiar de paso y al cambiar el tamaño de la
  // ventana (girar el aparato, abrir el teclado): un globo anclado a una
  // posición vieja apunta al vacío.
  useEffect(() => {
    const medir = () => {
      // Sin ancla (el paso de bienvenida) o si el elemento no está en pantalla:
      // globo centrado y fondo liso. Un paso que apunta a algo que no existe se
      // degrada a una tarjeta normal en vez de dejar el pico señalando al aire.
      const el = paso.ancla ? document.querySelector(paso.ancla) : null;
      setMedida(el ? medirPaso(el) : null);
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [paso.ancla]);

  const avanzar = useCallback(() => {
    if (ultimo) onFinish();
    else setIndice((v) => v + 1);
  }, [ultimo, onFinish]);

  // Escape salta el recorrido. Sin esto, un teclado físico se queda sin salida
  // que no sea acertar con el botón.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFinish(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onFinish]);

  // El foco viaja con el paso, para que un lector de pantalla lea cada globo
  // en vez de quedarse anclado al primero.
  useEffect(() => { tarjetaRef.current?.focus(); }, [indice]);

  // Con ancla, el globo se pega encima de ella; sin ancla, va centrado.
  const estiloTarjeta: React.CSSProperties = medida
    ? {
        position: 'fixed',
        bottom: medida.tarjetaBottom,
        left: medida.tarjetaLeft,
        width: medida.tarjetaAncho,
      }
    : {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `min(20rem, calc(100vw - ${MARGEN * 2}px))`,
      };

  return createPortal(
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-titulo"
    >
      {/*
        El fondo oscuro y el hueco son el MISMO elemento: una sombra enorme
        hacia fuera deja transparente lo de dentro. Así el recorte sigue al
        recuadro sin recalcular cuatro paneles ni usar máscaras SVG.
      */}
      {/*
        Las `key` no son decorativas. Sin ellas React reutiliza el mismo <div>
        para el fondo liso y para el recuadro iluminado, porque los dos son un
        div en la misma posición: la `transition-all` se dispara entonces entre
        dos cosas que no tienen nada que ver y el fondo de pantalla completa se
        encoge hasta el hueco al pasar del primer paso al segundo.
        Con `key` distintas, uno se va y el otro entra ya colocado, y la
        transición queda solo para lo que sí debe animarse: el recuadro
        deslizándose de una pestaña a la siguiente.
      */}
      {medida ? (
        <div
          key="hueco"
          aria-hidden="true"
          className="pointer-events-none fixed rounded-2xl transition-all duration-300 motion-reduce:transition-none"
          style={{
            top: medida.hueco.top - HOLGURA,
            left: medida.hueco.left - HOLGURA,
            width: medida.hueco.width + HOLGURA * 2,
            height: medida.hueco.height + HOLGURA * 2,
            boxShadow: '0 0 0 9999px rgba(4, 8, 20, 0.62)',
          }}
        />
      ) : (
        <div key="fondo" aria-hidden="true" className="fixed inset-0" style={{ background: 'rgba(4, 8, 20, 0.62)' }} />
      )}

      <div
        ref={tarjetaRef}
        tabIndex={-1}
        style={estiloTarjeta}
        className="animate-fade-in outline-none motion-reduce:animate-none"
      >
        <div className="rounded-2xl border border-border bg-card p-4 shadow-lifted">
          <div className="flex items-start gap-2.5">
            <paso.icono aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div className="flex-1">
              <h3 id="tour-titulo" className="text-sm font-bold text-foreground">
                {t(`map.tour.${paso.clave}Title`)}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`map.tour.${paso.clave}Body`)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            {/* Puntos de progreso: sin ellos el recorrido no dice cuánto queda
                y cualquier paso puede parecer el último. */}
            <div
              className="flex flex-1 items-center gap-1.5"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={PASOS.length}
              aria-valuenow={indice + 1}
              aria-label={t('map.tour.progress', { current: indice + 1, total: PASOS.length })}
            >
              {PASOS.map((p, i) => (
                <span
                  key={p.clave}
                  aria-hidden="true"
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none',
                    i === indice ? 'w-4 bg-primary' : 'w-1.5 bg-muted',
                  )}
                />
              ))}
            </div>

            {!ultimo && (
              <button
                onClick={onFinish}
                className="min-h-[44px] px-2 text-xs font-semibold text-muted-foreground"
              >
                {t('map.tour.skip')}
              </button>
            )}

            <button
              onClick={avanzar}
              className="min-h-[44px] rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground active:scale-95 transition-transform motion-reduce:transition-none"
            >
              {ultimo ? t('map.tour.done') : t('map.tour.next')}
            </button>
          </div>
        </div>

        {/* Pico hacia abajo, sobre el centro del ancla y no sobre el de la
            tarjeta: cuando el globo se acota contra el borde de la pantalla,
            los dos centros dejan de coincidir. */}
        {medida && (
          <div
            aria-hidden="true"
            style={{ left: medida.picoLeft }}
            className="absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-border bg-card"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
