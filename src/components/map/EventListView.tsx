import { useTranslation } from 'react-i18next';
import { Clock, MapPin, Users } from 'lucide-react';
import { format } from 'date-fns';
import { es as esLocale, enUS } from 'date-fns/locale';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { CATEGORY_ICONS } from '@/lib/categoryIcons';
import { cn } from '@/lib/utils';
import type { MapEvent } from '@/stores/eventStore';

interface Props {
  events: MapEvent[];
  filterCategory: string | null;
  searchQuery?: string;
  onSelect: (event: MapEvent) => void;
}

export function EventListView({ events, filterCategory, searchQuery = '', onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('en') ? enUS : esLocale;

  const q = searchQuery.trim().toLowerCase();
  const visible = events.filter(e =>
    (!filterCategory || e.category === filterCategory) &&
    (!q || e.title.toLowerCase().includes(q))
  );

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-8">
        <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground text-sm font-medium">{t('map.noEvents')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {visible.map(event => {
        const cat = EVENT_CATEGORIES.find(c => c.key === event.category);
        const spotsLeft = event.max_spots - event.current_spots;
        const Icon = cat ? CATEGORY_ICONS[cat.key] : null;

        return (
          <button
            key={event.id}
            onClick={() => onSelect(event)}
            className="w-full bg-card rounded-2xl shadow-soft overflow-hidden text-left active:scale-[0.98] transition-transform"
          >
            {/* Category color bar */}
            <div className="h-1.5 w-full" style={{ background: cat?.color ?? 'hsl(var(--muted))' }} />

            <div className="p-4">
              {/* Category chip */}
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-primary-foreground mb-2"
                style={{ background: cat?.color ?? 'hsl(var(--muted))' }}
              >
                {Icon && <Icon className="w-3 h-3" />}
                <span>{cat ? t('categories.' + cat.key) : event.category}</span>
              </div>

              <h3 className="font-bold text-foreground text-base leading-tight mb-2">{event.title}</h3>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{format(new Date(event.starts_at), 'EEE d MMM · HH:mm', { locale: dateLocale })}</span>
                </div>

                {event.address && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{event.address}</span>
                  </div>
                )}

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    <span>
                      {spotsLeft <= 0
                        ? t('event.full')
                        : t('event.spotLeftOther', { count: spotsLeft })}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2.5 py-1 rounded-full',
                      spotsLeft <= 0
                        ? 'bg-destructive/10 text-destructive'
                        : spotsLeft <= 3
                          ? 'bg-warning/10 text-warning'
                          : 'bg-success/10 text-success'
                    )}
                  >
                    {spotsLeft <= 0
                      ? t('event.full')
                      : `${event.current_spots}/${event.max_spots}`}
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
