import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { CATEGORY_ICONS } from '@/lib/categoryIcons';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isPast, formatDistanceToNow } from 'date-fns';
import { es as esLocale, enUS } from 'date-fns/locale';

interface EventWithParticipation {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string;
  address: string | null;
  current_spots: number;
  max_spots: number;
  role: 'organizer' | 'joined';
}

export default function MyEvents() {
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('en') ? enUS : esLocale;
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [events, setEvents] = useState<EventWithParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!user) return;
    const fetchMyEvents = async () => {
      setLoading(true);
      try {
        // Events I created
        const { data: created } = await supabase
          .from('events')
          .select('*')
          .eq('creator_id', user.id);

        // Events I joined
        const { data: participated } = await supabase
          .from('event_participants')
          .select('event_id, events(*)')
          .eq('user_id', user.id);

        const seen = new Set<string>();
        const all: EventWithParticipation[] = [];
        created?.forEach((e) => {
          seen.add(e.id);
          all.push({ ...e, role: 'organizer' });
        });
        participated?.forEach((p) => {
          if (p.events && !seen.has(p.events.id)) {
            seen.add(p.events.id);
            all.push({ ...p.events, role: 'joined' });
          }
        });
        setEvents(all);
      } finally {
        setLoading(false);
      }
    };
    fetchMyEvents();
  }, [user]);

  const allFiltered = events.filter(e =>
    activeTab === 'upcoming' ? !isPast(new Date(e.ends_at)) : isPast(new Date(e.ends_at))
  );
  const filtered = allFiltered.slice(0, visibleCount);

  return (
    <div className="min-h-screen pb-24 pt-4 px-4 safe-top">
      <Helmet>
        <title>{t('myEvents.title')} — ConnectTec</title>
        <meta name="description" content={t('myEvents.metaDesc')} />
        <link rel="canonical" href="/events" />
        <meta property="og:title" content={`${t('myEvents.title')} — ConnectTec`} />
        <meta property="og:description" content={t('myEvents.metaDesc')} />
        <meta property="og:url" content="/events" />
      </Helmet>
      <h1 className="text-2xl font-extrabold text-foreground mb-4">{t('myEvents.title')}</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['upcoming', 'past'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setVisibleCount(PAGE_SIZE); }}
            className={cn(
              'px-5 py-2 rounded-full text-sm font-semibold transition-all',
              activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {t(`myEvents.${tab}`)}
          </button>
        ))}
      </div>

      {/* Event cards */}
      <div className="space-y-3">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl p-4 shadow-soft space-y-2">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{t(activeTab === 'upcoming' ? 'myEvents.emptyUpcoming' : 'myEvents.emptyPast')}</p>
          </div>
        ) : null}
        {!loading && filtered.map(event => {
          const cat = EVENT_CATEGORIES.find(c => c.key === event.category);
          return (
            <div key={event.id} className="bg-card rounded-2xl p-4 shadow-soft">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-primary-foreground mb-2"
                    style={{ background: cat?.color }}
                  >
                    {cat && (() => { const Icon = CATEGORY_ICONS[cat.key]; return <Icon className="w-2.5 h-2.5 mr-0.5 inline" />; })()}
                    {cat ? t('categories.' + cat.key) : ''}
                  </div>
                  <h2 className="font-bold text-foreground text-base">{event.title}</h2>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{format(new Date(event.starts_at), 'MMM d, h:mm a', { locale: dateLocale })}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    event.role === 'organizer' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'
                  )}>
                    {event.role === 'organizer' ? t('myEvents.organizer') : t('myEvents.joined')}
                  </span>
                  {!isPast(new Date(event.starts_at)) && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(event.starts_at), { addSuffix: true, locale: dateLocale })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!loading && visibleCount < allFiltered.length && (
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="w-full py-2 text-sm font-semibold text-primary"
          >
            {t('common.loadMore')}
          </button>
        )}
      </div>
    </div>
  );
}
