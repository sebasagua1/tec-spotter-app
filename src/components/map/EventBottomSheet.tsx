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
import { Clock, MapPin, Users, X, Loader2, Pencil } from 'lucide-react';
import { CATEGORY_ICONS } from '@/lib/categoryIcons';
import { EditEventSheet } from '@/components/map/EditEventSheet';
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
  const [localCurrentSpots, setLocalCurrentSpots] = useState(event.current_spots);
  const spotsLeft = event.max_spots - localCurrentSpots;
  const [hasJoined, setHasJoined] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [attendees, setAttendees] = useState<Array<{ id: string | null; name: string | null }>>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const isCreator = user?.id === event.creator_id;

  const [isOngoing, setIsOngoing] = useState(() => {
    const now = Date.now();
    return now >= new Date(event.starts_at).getTime() && now <= new Date(event.ends_at).getTime();
  });

  // Re-evaluate every 30 s so the check-in button appears/disappears at the real boundary
  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      return now >= new Date(event.starts_at).getTime() && now <= new Date(event.ends_at).getTime();
    };
    setIsOngoing(compute());
    const id = setInterval(() => setIsOngoing(compute()), 30_000);
    return () => clearInterval(id);
  }, [event.starts_at, event.ends_at]);

  // Keep localCurrentSpots in sync when the realtime-updated event prop arrives
  useEffect(() => {
    setLocalCurrentSpots(event.current_spots);
  }, [event.current_spots]);

  useEffect(() => {
    if (!isCreator) return;
    let cancelled = false;
    const fetchAttendees = async () => {
      setLoadingAttendees(true);
      const { data: participants } = await supabase
        .from('event_participants')
        .select('user_id')
        .eq('event_id', event.id)
        .eq('status', 'joined');
      if (cancelled) return;
      if (participants && participants.length > 0) {
        const ids = participants.map(p => p.user_id);
        const { data: profiles } = await supabase
          .from('public_profiles')
          .select('id, name')
          .in('id', ids);
        if (!cancelled) setAttendees(profiles ?? []);
      } else {
        setAttendees([]);
      }
      if (!cancelled) setLoadingAttendees(false);
    };
    fetchAttendees();
    return () => { cancelled = true; };
  }, [isCreator, event.id]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!user) { setChecking(false); return; }
      setChecking(true);
      const { data } = await supabase
        .from('event_participants')
        .select('id, checked_in, rating')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .eq('status', 'joined')
        .maybeSingle();
      if (!cancelled) {
        setHasJoined(!!data);
        setCheckedIn(data?.checked_in ?? false);
        setUserRating((data as { rating?: number | null } | null)?.rating ?? null);
        setChecking(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [event.id, user]);

  const handleJoin = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    // Optimistic UI: mark joined and decrement available spots immediately
    setHasJoined(true);
    const prevSpots = localCurrentSpots;
    setLocalCurrentSpots(s => s + 1);
    const { error } = await supabase
      .from('event_participants')
      .insert({ event_id: event.id, user_id: user.id, status: 'joined' });
    if (error) {
      setLocalCurrentSpots(prevSpots);
      if (error.code === '23505') {
        toast({ title: t('event.alreadyJoined') });
        setHasJoined(true);
      } else if (error.message?.includes('EVENT_FULL')) {
        setHasJoined(false);
        toast({ title: t('event.eventFull'), variant: 'destructive' });
      } else {
        // Unknown error — sync UI back to actual DB state
        setHasJoined(false);
        const { data: recheck } = await supabase
          .from('event_participants')
          .select('id')
          .eq('event_id', event.id)
          .eq('user_id', user.id)
          .eq('status', 'joined')
          .maybeSingle();
        setHasJoined(!!recheck);
        toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: t('event.joinedToast'), description: t('event.joinedDesc', { title: event.title }) });
    }
    setSubmitting(false);
  };

  const handleLeave = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setHasJoined(false);
    const prevSpots = localCurrentSpots;
    setLocalCurrentSpots(s => s - 1);
    const { error } = await supabase
      .from('event_participants')
      .delete()
      .eq('event_id', event.id)
      .eq('user_id', user.id);
    if (error) {
      setHasJoined(true);
      setLocalCurrentSpots(prevSpots);
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('event.leftToast'), description: t('event.leftDesc', { title: event.title }) });
    }
    setSubmitting(false);
  };

  const handleCancelEvent = async () => {
    setSubmitting(true);
    const { error } = await supabase
      .from('events')
      .update({ is_active: false })
      .eq('id', event.id);
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      onClose();
    }
    setSubmitting(false);
  };

  // GPS coordinates are client-reported; this raises the bar against casual fraud
  // but cannot be considered a hard guarantee against GPS spoofing.
  const handleCheckIn = () => {
    if (!user || checkingIn) return;
    setCheckingIn(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { data, error } = await supabase.rpc('check_in_to_event', {
          _event_id: event.id,
          _lat: pos.coords.latitude,
          _lng: pos.coords.longitude,
        });
        if (error) {
          const msg = error.message ?? '';
          if (msg.includes('TOO_FAR_FROM_EVENT')) {
            toast({ title: t('event.checkInTooFar'), variant: 'destructive' });
          } else if (msg.includes('OUTSIDE_EVENT_WINDOW')) {
            toast({ title: t('event.checkInWindow'), variant: 'destructive' });
          } else if (msg.includes('NOT_A_PARTICIPANT')) {
            toast({ title: t('event.checkInNotParticipant'), variant: 'destructive' });
          } else {
            toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
          }
        } else {
          setCheckedIn(true);
          toast({ title: t('event.checkInSuccess') });
        }
        setCheckingIn(false);
      },
      (err) => {
        toast({ title: t('map.locError'), description: err.message, variant: 'destructive' });
        setCheckingIn(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleRate = async (stars: number) => {
    if (!user || submittingRating) return;
    setSubmittingRating(true);
    const { error } = await supabase.rpc('rate_event', {
      p_event_id: event.id,
      p_user_id: user.id,
      p_rating: stars,
    });
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } else {
      setUserRating(stars);
      toast({ title: t('event.ratingSubmitted') });
    }
    setSubmittingRating(false);
  };

  const eventEnded = Date.now() > new Date(event.ends_at).getTime();

  return (
    <>
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
          {cat && (() => { const Icon = CATEGORY_ICONS[cat.key]; return <Icon className="w-3.5 h-3.5" />; })()}
          <span>{cat ? t('categories.' + cat.key) : ''}</span>
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

        {localCurrentSpots > 0 && (
          <div className="mb-4 text-xs text-muted-foreground">
            {localCurrentSpots === 1
              ? t('event.joinedPersonOne', { count: localCurrentSpots })
              : t('event.joinedPersonOther', { count: localCurrentSpots })}
          </div>
        )}

        {/* Organizer panel */}
        {!checking && isCreator && (
          <div className="mb-4 border border-border rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('event.organizedByYou')}
              </p>
              <button
                onClick={() => setEditOpen(true)}
                aria-label={t('edit.title')}
                className="flex items-center gap-1 text-xs text-primary font-semibold"
              >
                <Pencil className="w-3 h-3" />
                {t('edit.title')}
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>{t('event.attendees', { count: attendees.length })}</span>
            </div>
            {loadingAttendees ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            ) : attendees.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('event.noAttendees')}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {attendees.map(a => (
                  <span
                    key={a.id ?? ''}
                    className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground font-medium"
                  >
                    {a.name ?? '?'}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          {checking ? (
            <Button disabled className="flex-1 h-12 rounded-xl font-bold">
              <Loader2 className="w-4 h-4 animate-spin" />
            </Button>
          ) : isCreator ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="flex-1 h-12 rounded-xl font-bold"
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('event.cancelEvent')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('event.cancelEventConfirm')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('event.cancelEventConfirmDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelEvent}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('event.cancelEvent')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

        {/* Check-in button — shown only when joined, not the creator, and event is live */}
        {!checking && !isCreator && hasJoined && isOngoing && (
          checkedIn ? (
            <Button disabled variant="secondary" className="w-full mt-2 h-11 rounded-xl font-bold">
              {t('event.checkedIn')}
            </Button>
          ) : (
            <Button
              onClick={handleCheckIn}
              disabled={checkingIn}
              variant="secondary"
              className="w-full mt-2 h-11 rounded-xl font-bold"
            >
              {checkingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t('event.checkIn')}
            </Button>
          )
        )}
        {/* Star rating — shown for past events the user attended (not the creator) */}
        {!checking && !isCreator && hasJoined && eventEnded && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {userRating ? t('event.yourRating') : t('event.rateEvent')}
            </p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  disabled={!!userRating || submittingRating}
                  onClick={() => handleRate(star)}
                  onMouseEnter={() => !userRating && setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="text-2xl transition-transform active:scale-110 disabled:cursor-default"
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                >
                  {star <= (hoverRating ?? userRating ?? 0) ? '⭐' : '☆'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

    {editOpen && (
      <EditEventSheet
        event={event}
        onClose={() => setEditOpen(false)}
        onSaved={onClose}
      />
    )}
    </>
  );
}
