import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Quién puede ver el evento.
 *
 * En vertical y con la explicación SIEMPRE visible, no solo la de la opción
 * marcada. Antes eran tres píldoras y una única línea debajo que cambiaba al
 * pulsar: para comparar las tres opciones había que ir tocándolas una a una,
 * justo cuando lo que se está decidiendo es cuál elegir.
 *
 * `role="radio"` y `aria-checked` en vez de `aria-pressed`: son excluyentes
 * entre sí, no tres interruptores independientes.
 */
export function PrivacySelector({ value, onChange }: Props) {
  const { t } = useTranslation();
  const options = [
    { key: 'open', label: t('create.privacyOpen'), hint: t('create.privacyHintOpen') },
    { key: 'friends', label: t('create.privacyFriends'), hint: t('create.privacyHintFriends') },
    { key: 'private', label: t('create.privacyPrivate'), hint: t('create.privacyHintPrivate') },
  ] as const;

  return (
    <div>
      <label className="text-sm font-semibold text-foreground mb-2 block">{t('create.privacy')}</label>
      <div className="space-y-2" role="radiogroup" aria-label={t('create.privacy')}>
        {options.map(opt => {
          const activa = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onChange(opt.key)}
              className={cn(
                'w-full flex items-start gap-3 text-left p-3 rounded-xl border transition-colors min-h-[44px]',
                activa
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-muted/40 hover:bg-muted/70'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                  activa ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                )}
              >
                {activa && <Check className="w-3 h-3 text-primary-foreground" />}
              </span>
              <span className="flex-1">
                <span className={cn('block text-sm font-semibold', activa ? 'text-foreground' : 'text-foreground/80')}>
                  {opt.label}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">{opt.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
