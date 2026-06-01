import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapEvent } from '@/stores/eventStore';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Clock, MapPin, Users, X, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es as esLocale, enUS } from 'date-fns/locale';

interface Props {
  event: MapEvent;
  onClose: () => void;
}

export function EventBottomSheet({ event, onClose }: Props) {
  const cat = EVENT_CATEGORIES.find(c => c.key === event.category);
  const { user } = useAuthStore();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('en') ? enUS : esLocale;
  const spotsLeft = event.max_spots - event.current_spots;
  const [hasJoined, setHasJoined] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isCreator = user?.id === event.creator_id;

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!user) { setChecking(false); return; }
      setChecking(true);
      const { data } = await supabase
        .from('event_participants')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setHasJoined(!!data);
        setChecking(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [event.id, user]);

  const handleJoin = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    // Optimistic UI
    setHasJoined(true);
    const { error } = await supabase
      .from('event_participants')
      .insert({ event_id: event.id, user_id: user.id, status: 'joined' });
    if (error) {
      if ((error as any).code === '23505') {
        toast({ title: t('event.alreadyJoined') });
        setHasJoined(true);
      } else if (error.message?.includes('EVENT_FULL')) {
        setHasJoined(false);
        toast({ title: t('event.eventFull'), variant: 'destructive' });
      } else {
        setHasJoined(false);
        toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: `🎉 ${t('event.joinedToast')}`, description: t('event.joinedDesc', { title: event.title }) });
    }
    setSubmitting(false);
  };

  const handleLeave = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setHasJoined(false);
    const { error } = await supabase
      .from('event_participants')
      .delete()
      .eq('event_id', event.id)
      .eq('user_id', user.id);
    if (error) {
      setHasJoined(true);
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('event.leftToast'), description: t('event.leftDesc', { title: event.title }) });
    }
    setSubmitting(false);
  };

  return (
    <div className="absolute bottom-20 left-0 right-0 z-20 animate-slide-up">
      <div className="mx-3 bg-card rounded-3xl shadow-lifted p-5 relative">
        <div className="drag-handle" />

        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-muted-foreground">
          <X className="w-5 h-5" />
        </button>

        {/* Category badge */}
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-primary-foreground mb-3"
          style={{ background: cat?.color }}
        >
          <span>{cat?.emoji}</span>
          <span>{cat?.label}</span>
        </div>

        <h3 className="text-lg font-extrabold text-foreground mb-2">{event.title}</h3>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{format(new Date(event.starts_at), 'MMM d, h:mm a', { locale: dateLocale })}</span>
          </div>
          {event.address && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{event.address}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>
              {spotsLeft <= 0
                ? t('event.full')
                : spotsLeft === 1
                  ? t('event.spotLeftOne')
                  : t('event.spotLeftOther', { count: spotsLeft })}
            </span>
          </div>
        </div>

        {event.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{event.description}</p>
        )}

        {event.current_spots > 0 && (
          <div className="mb-4 text-xs text-muted-foreground">
            {event.current_spots === 1
              ? t('event.joinedPersonOne', { count: event.current_spots })
              : t('event.joinedPersonOther', { count: event.current_spots })}
          </div>
        )}

        <div className="flex gap-3">
          {checking ? (
            <Button disabled className="flex-1 h-12 rounded-xl font-bold">
              <Loader2 className="w-4 h-4 animate-spin" />
            </Button>
          ) : isCreator ? (
            <Button disabled variant="secondary" className="flex-1 h-12 rounded-xl font-bold">
              {t('event.hosting')}
            </Button>
          ) : hasJoined ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={submitting}
                  variant="destructive"
                  className="flex-1 h-12 rounded-xl font-bold"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('event.leave')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('event.leaveConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('event.leaveConfirmDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLeave}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('event.leaveConfirmAction')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              onClick={handleJoin}
              disabled={spotsLeft <= 0 || submitting}
              className="flex-1 h-12 rounded-xl font-bold"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('event.join')}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            className="h-12 rounded-xl font-semibold px-6"
          >
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
