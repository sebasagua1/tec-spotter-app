import { useState } from 'react';
import { z } from 'zod';
import { X, Minus, Plus as PlusIcon, MapPin, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimePicker } from '@/components/ui/time-picker';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';

const eventSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(80, 'Title too long'),
  category: z.string().min(1),
  address: z.string().trim().max(120, 'Location name too long').optional(),
  description: z.string().trim().max(500, 'Description too long').optional(),
  maxSpots: z.number().int().min(2).max(100),
  privacy: z.enum(['open', 'friends', 'private']),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  startsAt: z.date().refine((d) => d.getTime() > Date.now() - 60_000, 'Date must be in the future'),
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
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('study');
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [maxSpots, setMaxSpots] = useState(10);
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('open');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    if (!user) return;

    if (!date || !time) {
      toast({ title: 'Missing info', description: 'Please pick a date and time.', variant: 'destructive' });
      return;
    }
    if (!pickedLocation) {
      toast({ title: 'Location required', description: 'Tap a spot on the map to place your event.', variant: 'destructive' });
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
        title: 'Check your event',
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
      ends_at: new Date(v.startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      max_spots: v.maxSpots,
      privacy: v.privacy,
      is_active: true,
      current_spots: 0,
      is_recurring: false,
      lng: v.lng,
      lat: v.lat,
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '🚩 Event created!', description: 'Your event is now live on the map.' });
      onClose();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-30 bg-foreground/40 animate-fade-in" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-lifted animate-slide-up max-h-[85vh] overflow-y-auto mx-auto max-w-[430px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="drag-handle" />

        <div className="px-5 pb-24">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-extrabold text-foreground">New Event</h2>
            <button onClick={onClose} className="p-1 text-muted-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            {/* Title */}
            <Input
              placeholder="Event title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-12 rounded-xl text-base"
            />

            {/* Category chips */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Category</label>
              <div className="flex flex-wrap gap-2">
                {EVENT_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setCategory(cat.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all',
                      category === cat.key
                        ? 'text-primary-foreground shadow-soft'
                        : 'bg-muted text-muted-foreground'
                    )}
                    style={category === cat.key ? { background: cat.color } : undefined}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'h-12 w-full justify-start text-left font-normal rounded-xl',
                        !date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, 'MMM d, yyyy') : <span>Pick date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Time</label>
                <TimePicker value={time} onChange={setTime} />
              </div>
            </div>

            {/* Location - Pick on map */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Location</label>
              {pickedLocation ? (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-xl border border-primary/20">
                  <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground flex-1">
                    📍 {pickedLocation.lat.toFixed(5)}, {pickedLocation.lng.toFixed(5)}
                  </span>
                  <button onClick={onClearLocation} className="text-xs text-muted-foreground underline">
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={onPickLocation}
                  className="w-full flex items-center gap-2 p-3 bg-muted rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <MapPin className="w-5 h-5" />
                  Tap to pick location on map
                </button>
              )}
              <Input
                placeholder="Location name (optional)"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="h-12 rounded-xl text-base mt-2"
              />
            </div>

            {/* Max spots stepper */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Max spots</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setMaxSpots(Math.max(2, maxSpots - 1))}
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-bold text-foreground w-8 text-center">{maxSpots}</span>
                <button
                  onClick={() => setMaxSpots(Math.min(100, maxSpots + 1))}
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Description */}
            <Textarea
              placeholder="Short description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="rounded-xl min-h-[80px]"
            />

            {/* Advanced */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm font-semibold text-primary"
            >
              {showAdvanced ? 'Hide advanced' : 'Advanced options'}
            </button>

            {showAdvanced && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-foreground mb-2 block">Privacy</label>
                  <div className="flex gap-2">
                    {['open', 'friends', 'private'].map(p => (
                      <button
                        key={p}
                        onClick={() => setPrivacy(p)}
                        className={cn(
                          'px-4 py-2 rounded-full text-xs font-semibold capitalize transition-all',
                          privacy === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Publish */}
            <Button
              onClick={handlePublish}
              disabled={loading || !title || !date || !time}
              className="w-full h-12 rounded-xl font-bold text-base"
            >
              {loading ? 'Publishing...' : 'Publish Event 🚩'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
