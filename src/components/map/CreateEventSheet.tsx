import { useState } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { X, Minus, Plus as PlusIcon, MapPin, CalendarIcon } from 'lucide-react';
import { PrivacySelector } from '@/components/ui/privacy-selector';
import { CATEGORY_ICONS } from '@/lib/categoryIcons';
import { format } from 'date-fns';
import { es as esLocale, enUS } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateTimeWheel } from '@/components/ui/datetime-wheel';
import { combineDateTime, toTimeValue } from '@/lib/datetime';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';

const eventSchema = z.object({
  title: z.string().trim().min(3).max(80),
  category: z.string().min(1),
  address: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  maxSpots: z.number().int().min(2).max(100),
  privacy: z.enum(['open', 'friends', 'private']),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  startsAt: z.date().refine((d) => d.getTime() > Date.now() - 60_000),
});

interface Props {
  onClose: () => void;
  onPickLocation: () => void;
  pickedLocation: { lng: number; lat: number } | null;
  onClearLocation: () => void;
}

export function CreateEventSheet({ onClose, onPickLocation, pickedLocation, onClearLocation }: Props) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('en') ? enUS : esLocale;
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('study');
  const [date, setDate] = useState<Date>();
  const [whenOpen, setWhenOpen] = useState(false);
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [maxSpots, setMaxSpots] = useState(10);
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('open');
  const [durationMins, setDurationMins] = useState(120);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);

  const DURATION_OPTIONS = [
    { mins: 30, label: t('create.duration30') },
    { mins: 60, label: t('create.duration60') },
    { mins: 120, label: t('create.duration120') },
    { mins: 180, label: t('create.duration180') },
    { mins: 240, label: t('create.duration240') },
  ];

  const handlePublish = async () => {
    if (!user) return;

    if (!date || !time) {
      toast({ title: t('create.missingInfo'), description: t('create.missingInfoDesc'), variant: 'destructive' });
      return;
    }
    if (!pickedLocation) {
      toast({ title: t('create.locationRequired'), description: t('create.locationRequiredDesc'), variant: 'destructive' });
      return;
    }

    const [hours, mins] = time.split(':').map(Number);
    const startsAt = new Date(date);
    startsAt.setHours(hours, mins, 0, 0);

    const parsed = eventSchema.safeParse({
      title,
      category,
      address: address || undefined,
      description: description || undefined,
      maxSpots,
      privacy,
      lng: pickedLocation.lng,
      lat: pickedLocation.lat,
      startsAt,
    });

    if (!parsed.success) {
      toast({
        title: t('create.checkEvent'),
        description: parsed.error.errors[0]?.message ?? 'Invalid input',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const v = parsed.data;
    const { error } = await supabase.from('events').insert({
      creator_id: user.id,
      title: v.title,
      category: v.category,
      address: v.address ?? null,
      description: v.description ?? null,
      starts_at: v.startsAt.toISOString(),
      ends_at: new Date(v.startsAt.getTime() + durationMins * 60 * 1000).toISOString(),
      max_spots: v.maxSpots,
      privacy: v.privacy,
      is_active: true,
      current_spots: 0,
      lng: v.lng,
      lat: v.lat,
    });

    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('create.created'), description: t('create.createdDesc') });
      onClose();
    }
    setLoading(false);
  };


  return (
    // Mismo z que el sheet de editar, por encima de BottomNav (z-50): en z-30
    // el fondo oscuro quedaba por debajo y la barra se veía iluminada sobre la
    // pantalla atenuada, además de seguir siendo pulsable con el modal abierto.
    <div className="fixed inset-0 z-[60] bg-foreground/40 animate-fade-in" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-lifted animate-slide-up max-h-[85vh] overflow-y-auto mx-auto max-w-[430px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="drag-handle" />

        <div className="px-5 pb-24">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-extrabold text-foreground">{t('create.title')}</h2>
            <button onClick={onClose} aria-label={t('common.close')} className="p-1 text-muted-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            {/* Title */}
            <Input
              placeholder={t('create.titlePh')}
              aria-label={t('create.titlePh')}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-12 rounded-xl text-base"
            />

            {/* Category chips */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">{t('create.category')}</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('create.category')}>
                {EVENT_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setCategory(cat.key)}
                    aria-pressed={category === cat.key}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all',
                      category === cat.key
                        ? 'text-primary-foreground shadow-soft'
                        : 'bg-muted text-muted-foreground'
                    )}
                    style={category === cat.key ? { background: cat.color } : undefined}
                  >
                    {(() => { const Icon = CATEGORY_ICONS[cat.key]; return <Icon className="w-4 h-4" />; })()}
                    <span>{t('categories.' + cat.key)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-1 block">{t('create.when')}</label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setWhenOpen(true)}
                className={cn(
                  'h-12 w-full justify-start text-left font-normal rounded-xl',
                  !(date && time) && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date && time
                  ? format(combineDateTime(date, time), "EEE d MMM · h:mm a", { locale: dateLocale })
                  : <span>{t('create.pickWhen')}</span>}
              </Button>
            </div>

            {/* Duration */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">{t('create.duration')}</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('create.duration')}>
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.mins}
                    type="button"
                    onClick={() => setDurationMins(opt.mins)}
                    aria-pressed={durationMins === opt.mins}
                    className={cn(
                      'px-4 py-2 rounded-full text-xs font-semibold transition-all',
                      durationMins === opt.mins
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location - Pick on map */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">{t('create.location')}</label>
              {pickedLocation ? (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-xl border border-primary/20">
                  <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground flex-1">
                    {pickedLocation.lat.toFixed(5)}, {pickedLocation.lng.toFixed(5)}
                  </span>
                  <button onClick={onClearLocation} className="text-xs text-muted-foreground underline">
                    {t('common.remove')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={onPickLocation}
                  className="w-full flex items-center gap-2 p-3 bg-muted rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <MapPin className="w-5 h-5" />
                  {t('create.pickOnMap')}
                </button>
              )}
              <Input
                placeholder={t('create.locationNamePh')}
                aria-label={t('create.locationNamePh')}
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="h-12 rounded-xl text-base mt-2"
              />
            </div>

            {/* Max spots stepper */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">{t('create.maxSpots')}</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setMaxSpots(Math.max(2, maxSpots - 1))}
                  aria-label={t('create.decreaseSpots')}
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-bold text-foreground w-8 text-center">{maxSpots}</span>
                <button
                  onClick={() => setMaxSpots(Math.min(100, maxSpots + 1))}
                  aria-label={t('create.increaseSpots')}
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Description */}
            <Textarea
              placeholder={t('create.descriptionPh')}
              aria-label={t('create.descriptionPh')}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="rounded-xl min-h-[80px]"
            />

            {/* Advanced */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm font-semibold text-primary"
            >
              {showAdvanced ? t('create.hideAdvanced') : t('create.showAdvanced')}
            </button>

            {showAdvanced && (
              <div className="space-y-3">
                <PrivacySelector value={privacy} onChange={setPrivacy} />
              </div>
            )}

            {/* Publish */}
            <Button
              onClick={handlePublish}
              disabled={loading || !title || !date || !time || !pickedLocation}
              className="w-full h-12 rounded-xl font-bold text-base"
            >
              {loading ? t('create.publishing') : t('create.publish')}
            </Button>
          </div>
        </div>
      </div>

      {whenOpen && (
        <DateTimeWheel
          value={date && time ? combineDateTime(date, time) : null}
          minDate={new Date()}
          title={t('create.when')}
          onCancel={() => setWhenOpen(false)}
          onConfirm={(d) => {
            setDate(d);
            setTime(toTimeValue(d));
            setWhenOpen(false);
          }}
        />
      )}
    </div>
  );
}
