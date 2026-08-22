import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { es as esLocale, enUS } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ITEM_H = 44;      // alto de cada fila
const VISIBLE = 5;      // filas visibles; impar para que haya una central
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;
const DAYS_AHEAD = 365;

interface ColumnProps {
  items: string[];
  index: number;
  onIndexChange: (i: number) => void;
  label: string;
  className?: string;
}

/**
 * Una columna de la rueda. El ajuste a la fila lo hace scroll-snap del
 * navegador —que es lo que da el frenado con inercia de iOS—; aquí solo se
 * traduce la posición de scroll a un índice.
 */
function WheelColumn({ items, index, onIndexChange, label, className }: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mientras el dedo mueve la rueda, sus propios scrollTop no deben
  // reposicionarla desde fuera o pelearía contra el gesto.
  const touching = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || touching.current) return;
    const target = index * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
  }, [index]);

  const handleScroll = () => {
    touching.current = true;
    if (settling.current) clearTimeout(settling.current);
    // El scroll con inercia no avisa de cuándo termina: se espera a que pare.
    settling.current = setTimeout(() => {
      touching.current = false;
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
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
      // i * ITEM_H, que es justo lo que calcula handleScroll.
      style={{ height: VISIBLE * ITEM_H }}
    >
      <div style={{ height: PAD }} aria-hidden />
      {items.map((item, i) => (
        <div
          key={item + i}
          role="option"
          aria-selected={i === index}
          className={cn(
            'snap-center flex items-center justify-center text-center transition-colors',
            i === index ? 'text-foreground font-semibold' : 'text-muted-foreground/50'
          )}
          style={{ height: ITEM_H }}
        >
          {item}
        </div>
      ))}
      <div style={{ height: PAD }} aria-hidden />
    </div>
  );
}

interface Props {
  value: Date | null;
  /** Días anteriores a este no se ofrecen. */
  minDate?: Date;
  title: string;
  onCancel: () => void;
  onConfirm: (value: Date) => void;
}

export function DateTimeWheel({ value, minDate, title, onCancel, onConfirm }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? enUS : esLocale;

  // Con `value` a null esto sería un Date nuevo en cada render, y arrastraría
  // a recalcular la lista de 365 días detrás.
  const base = useMemo(() => value ?? new Date(), [value]);

  // El rango arranca en el más antiguo entre el mínimo y el valor actual: al
  // editar un evento pasado, su propia fecha tiene que seguir estando.
  const firstDay = useMemo(() => {
    const floor = startOfDay(minDate ?? new Date());
    const current = startOfDay(base);
    return current < floor ? current : floor;
  }, [minDate, base]);

  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(firstDay, i)),
    [firstDay]
  );

  const dayLabels = useMemo(
    () =>
      days.map((d) => {
        const today = new Date();
        if (isSameDay(d, today)) return t('when.today');
        if (isSameDay(d, addDays(today, 1))) return t('when.tomorrow');
        return format(d, 'EEE d MMM', { locale });
      }),
    [days, locale, t]
  );

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => `${i + 1}`), []);
  const minutes = useMemo(
    () => Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0')),
    []
  );
  const meridiems = useMemo(() => ['AM', 'PM'], []);

  const [dayIdx, setDayIdx] = useState(() =>
    Math.max(0, days.findIndex((d) => isSameDay(d, base)))
  );
  const [hourIdx, setHourIdx] = useState(() => {
    const h = base.getHours() % 12;
    return h === 0 ? 11 : h - 1;
  });
  const [minIdx, setMinIdx] = useState(() => Math.round(base.getMinutes() / 5) % 12);
  const [merIdx, setMerIdx] = useState(() => (base.getHours() >= 12 ? 1 : 0));

  const handleConfirm = () => {
    const d = new Date(days[dayIdx]);
    const hour12 = parseInt(hours[hourIdx], 10);
    const hour24 = merIdx === 1 ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12;
    d.setHours(hour24, parseInt(minutes[minIdx], 10), 0, 0);
    onConfirm(d);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-foreground/40 animate-fade-in" onClick={onCancel}>
      <div
        className="absolute bottom-0 left-0 right-0 mx-auto sm:max-w-[430px] bg-card rounded-t-3xl shadow-lifted animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drag-handle" />
        <div className="px-5 pt-1 pb-3 text-center">
          <h2 className="text-base font-extrabold text-foreground">{title}</h2>
        </div>

        <div className="relative px-4">
          {/* Banda de selección, como la de iOS. */}
          <div
            className="pointer-events-none absolute left-4 right-4 top-1/2 -translate-y-1/2 rounded-xl bg-muted"
            style={{ height: ITEM_H }}
            aria-hidden
          />
          <div className="relative flex gap-1">
            <WheelColumn items={dayLabels} index={dayIdx} onIndexChange={setDayIdx} label={t('when.date')} className="flex-[2]" />
            <WheelColumn items={hours} index={hourIdx} onIndexChange={setHourIdx} label={t('when.hour')} className="flex-1" />
            <WheelColumn items={minutes} index={minIdx} onIndexChange={setMinIdx} label={t('when.minute')} className="flex-1" />
            <WheelColumn items={meridiems} index={merIdx} onIndexChange={setMerIdx} label={t('when.meridiem')} className="flex-1" />
          </div>
        </div>

        <div className="flex gap-3 px-5 pt-3 pb-5">
          <Button variant="outline" onClick={onCancel} className="h-12 rounded-xl px-6">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} className="flex-1 h-12 rounded-xl font-bold">
            {t('when.done')}
          </Button>
        </div>
      </div>
    </div>
  );
}
