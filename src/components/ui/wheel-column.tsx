import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Alto de fila por defecto — el mismo que ya usaba el selector de fecha/hora. */
export const WHEEL_ITEM_HEIGHT = 44;

interface WheelColumnProps {
  items: string[];
  index: number;
  onIndexChange: (i: number) => void;
  label: string;
  className?: string;
  itemHeight?: number;
  /** Filas visibles a la vez; impar para que haya una central. */
  visibleRows?: number;
}

/**
 * Una columna de rueda estilo iOS, reutilizada por el selector de fecha/hora
 * y por cualquier otro campo que se elija con scroll en vez de tecleando.
 *
 * El ajuste a la fila lo hace scroll-snap del navegador —que es lo que da el
 * frenado con inercia de iOS—; aquí solo se traduce la posición de scroll a
 * un índice.
 */
export function WheelColumn({
  items,
  index,
  onIndexChange,
  label,
  className,
  itemHeight = WHEEL_ITEM_HEIGHT,
  visibleRows = 5,
}: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mientras el dedo mueve la rueda, sus propios scrollTop no deben
  // reposicionarla desde fuera o pelearía contra el gesto.
  const touching = useRef(false);
  const pad = ((visibleRows - 1) / 2) * itemHeight;

  useEffect(() => {
    const el = ref.current;
    if (!el || touching.current) return;
    const target = index * itemHeight;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
  }, [index, itemHeight]);

  const handleScroll = () => {
    touching.current = true;
    if (settling.current) clearTimeout(settling.current);
    // El scroll con inercia no avisa de cuándo termina: se espera a que pare.
    settling.current = setTimeout(() => {
      touching.current = false;
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / itemHeight)));
      if (i !== index) onIndexChange(i);
    }, 120);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      onScroll={handleScroll}
      className={cn(
        'relative overflow-y-scroll snap-y snap-mandatory no-scrollbar touch-pan-y',
        className
      )}
      // Sin scroll-padding: desplaza el punto de anclaje de snap media
      // columna y el navegador acaba rechazando el scrollTop que se le pide.
      // Con los huecos de arriba y abajo, el anclaje de la fila i cae ya en
      // i * itemHeight, que es justo lo que calcula handleScroll.
      style={{ height: visibleRows * itemHeight }}
    >
      <div style={{ height: pad }} aria-hidden />
      {items.map((item, i) => (
        <div
          key={item + i}
          role="option"
          aria-selected={i === index}
          className={cn(
            'snap-center flex items-center justify-center text-center transition-colors',
            i === index ? 'text-foreground font-semibold' : 'text-muted-foreground/50'
          )}
          style={{ height: itemHeight }}
        >
          {item}
        </div>
      ))}
      <div style={{ height: pad }} aria-hidden />
    </div>
  );
}
