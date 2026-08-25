import { cn } from '@/lib/utils';

interface Props {
  // `readonly`: las listas de constants.ts son `as const` y solo se recorren
  // aquí. Pedirlas mutables obligaba a copiarlas en cada llamada.
  options: readonly string[];
  selected: readonly string[];
  onToggle: (item: string) => void;
  renderLabel?: (item: string) => string;
}

export function ChipSelector({ options, selected, onToggle, renderLabel }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(item => (
        <button
          key={item}
          type="button"
          onClick={() => onToggle(item)}
          aria-pressed={selected.includes(item)}
          className={cn(
            'inline-flex items-center justify-center min-h-[44px] px-4 rounded-full text-sm font-semibold transition-all',
            selected.includes(item) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          {renderLabel ? renderLabel(item) : item}
        </button>
      ))}
    </div>
  );
}
