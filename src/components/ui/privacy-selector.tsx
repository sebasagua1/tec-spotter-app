import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function PrivacySelector({ value, onChange }: Props) {
  const { t } = useTranslation();
  const options = [
    { key: 'open', label: t('create.privacyOpen') },
    { key: 'friends', label: t('create.privacyFriends') },
    { key: 'private', label: t('create.privacyPrivate') },
  ] as const;

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
              'px-4 py-2 rounded-full text-xs font-semibold transition-all',
              value === opt.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
