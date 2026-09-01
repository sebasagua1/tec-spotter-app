import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MEXICO_STATES, countryList } from '@/lib/origin';
import { cn } from '@/lib/utils';

interface Props {
  /** 'foraneo' busca estado de México; 'international', país. */
  mode: 'foraneo' | 'international';
  value: string | null;
  onChange: (value: string) => void;
}

export function OriginPicker({ mode, value, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    if (mode === 'foraneo') return MEXICO_STATES.map((s) => ({ code: s, name: s }));
    return countryList(i18n.language || 'es');
  }, [mode, i18n.language]);

  // Sin acentos y en minúsculas: buscar "mexico" tiene que encontrar "México".
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(query.trim());
  const visible = q ? options.filter((o) => norm(o.name).includes(q)) : options;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(mode === 'foraneo' ? 'origin.searchState' : 'origin.searchCountry')}
          className="h-12 rounded-xl text-base pl-10"
        />
      </div>

      <div className="space-y-2 max-h-[340px] overflow-y-auto">
        {visible.map((o) => (
          <button
            key={o.code}
            type="button"
            onClick={() => onChange(o.code)}
            className={cn(
              'w-full p-3.5 rounded-xl text-left font-semibold transition-all border-2',
              value === o.code
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border bg-card text-foreground/80'
            )}
          >
            {o.name}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">{t('origin.noResults')}</p>
        )}
      </div>
    </div>
  );
}
