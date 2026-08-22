import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function PrivacySelector({ value, onChange }: Props) {
  const { t } = useTranslation();
  const options = [
    { key: 'open', label: t('create.privacyOpen'), hint: t('create.privacyHintOpen') },
    { key: 'friends', label: t('create.privacyFriends'), hint: t('create.privacyHintFriends') },
    { key: 'private', label: t('create.privacyPrivate'), hint: t('create.privacyHintPrivate') },
  ] as const;

  // Las tres opciones no se explican solas — sobre todo "Privado", que ahora
  // significa "visible pero con aprobación", no "oculto".
  const hint = options.find(o => o.key === value)?.hint;

  return (
    <div>
      <label className="text-sm font-semibold text-foreground mb-2 block">{t('create.privacy')}</label>
      <div className="flex gap-2 flex-wrap" role="group" aria-label={t('create.privacy')}>
        {options.map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={value === opt.key}
            className={cn(
              'inline-flex items-center justify-center min-h-[44px] px-4 rounded-full text-xs font-semibold transition-all',
              value === opt.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}
