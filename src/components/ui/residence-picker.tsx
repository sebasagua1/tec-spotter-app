import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { RESIDENCE_OPTIONS } from '@/lib/constants';

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export function ResidencePicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {RESIDENCE_OPTIONS.map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          aria-pressed={value === opt.key}
          className={cn(
            'w-full p-4 rounded-xl text-left font-semibold transition-all border-2',
            value === opt.key
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border bg-card text-foreground/80'
          )}
        >
          {t('residence.' + opt.key)}
        </button>
      ))}
    </div>
  );
}
