import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.startsWith('en') ? 'en' : 'es';

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn('inline-flex rounded-full bg-muted p-1 text-sm font-bold', className)}
    >
      {(['es', 'en'] as const).map((lng) => (
        <button
          key={lng}
          onClick={() => i18n.changeLanguage(lng)}
          aria-pressed={current === lng}
          className={cn(
            'inline-flex items-center justify-center min-h-[36px] px-4 rounded-full uppercase transition-colors',
            current === lng ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground'
          )}
        >
          {lng}
        </button>
      ))}
    </div>
  );
}
