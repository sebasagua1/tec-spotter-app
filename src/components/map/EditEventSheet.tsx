import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CalendarIcon, Minus, Plus as PlusIcon, Loader2 } from 'lucide-react';
import { PrivacySelector } from '@/components/ui/privacy-selector';
import { format } from 'date-fns';
import { es as esLocale, enUS } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimePicker } from '@/components/ui/time-picker';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { MapEvent } from '@/stores/eventStore';

interface Props {
  event: MapEvent;
  onClose: () => void;
  onSaved: () => void;
}

const toTimeString = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function EditEventSheet({ event, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dateLocale = i18n.language?.startsWith('en') ? enUS : esLocale;

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? '');
  const [startDate, setStartDate] = useState<Date>(new Date(event.starts_at));
  const [startTime, setStartTime] = useState(toTimeString(event.starts_at));
  const [endDate, setEndDate] = useState<Date>(new Date(event.ends_at));
  const [endTime, setEndTime] = useState(toTimeString(event.ends_at));
  const [maxSpots, setMaxSpots] = useState(event.max_spots);
  const [privacy, setPrivacy] = useState(event.privacy);
  const [saving, setSaving] = useState(false);

  const buildDatetime = (date: Date, time: string): Date => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: t('edit.titleRequired'), variant: 'destructive' });
      return;
    }
    const startsAt = buildDatetime(startDate, startTime);
    const endsAt = buildDatetime(endDate, endTime);

    if (endsAt <= startsAt) {
      toast({ title: t('edit.endBeforeStart'), variant: 'destructive' });
      return;
    }
    if (maxSpots < event.current_spots) {
      toast({ title: t('edit.spotsBelowCurrent'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('events')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        max_spots: maxSpots,
        privacy,
      })
      .eq('id', event.id);

    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('edit.saved') });
      onSaved();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 animate-fade-in" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-lifted animate-slide-up max-h-[88vh] overflow-y-auto mx-auto max-w-[430px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="drag-handle" />
        <div className="px-5 pb-24">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-extrabold text-foreground">{t('edit.title')}</h2>
            <button onClick={onClose} aria-label={t('common.close')} className="p-1 text-muted-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            {/* Title */}
            <Input
              placeholder={t('create.titlePh')}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-12 rounded-xl text-base"
            />

            {/* Description */}
            <Textarea
              placeholder={t('create.descriptionPh')}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="rounded-xl text-base resize-none"
              rows={3}
            />

            {/* Start date & time */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">{t('edit.starts')}</label>
              <div className="grid grid-cols-2 gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-12 w-full justify-start font-normal rounded-xl">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(startDate, 'MMM d, yyyy', { locale: dateLocale })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={d => d && setStartDate(d)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
            </div>

            {/* End date & time */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">{t('edit.ends')}</label>
              <div className="grid grid-cols-2 gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-12 w-full justify-start font-normal rounded-xl">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(endDate, 'MMM d, yyyy', { locale: dateLocale })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={d => d && setEndDate(d)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <TimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>

            {/* Max spots */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">{t('create.maxSpots')}</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setMaxSpots(Math.max(event.current_spots, maxSpots - 1))}
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
              {maxSpots === event.current_spots && event.current_spots > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{t('edit.spotsAtMin', { count: event.current_spots })}</p>
              )}
            </div>

            {/* Privacy */}
            <PrivacySelector value={privacy} onChange={setPrivacy} />
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-5 py-4 flex gap-3">
          <Button variant="outline" onClick={onClose} className="h-12 rounded-xl px-6">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex-1 h-12 rounded-xl font-bold"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('edit.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
