import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  className?: string;
}

const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const minutes = ['00', '15', '30', '45'];

export function TimePicker({ value, onChange, className }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState(value?.split(':')[0] || '');
  const [selectedMinute, setSelectedMinute] = useState(value?.split(':')[1] || '');

  const handleSelect = (hour: string, minute: string) => {
    setSelectedHour(hour);
    setSelectedMinute(minute);
    onChange(`${hour}:${minute}`);
    setOpen(false);
  };

  const displayTime = value
    ? (() => {
        const [h, m] = value.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${display}:${m} ${ampm}`;
      })()
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-12 w-full justify-start text-left font-normal rounded-xl',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {displayTime || <span>Pick time</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 pointer-events-auto" align="start">
        <div className="p-3">
          <p className="text-sm font-semibold text-foreground mb-2">Select time</p>
          <ScrollArea className="h-48">
            <div className="grid grid-cols-2 gap-1">
              {hours.map(h =>
                minutes.map(m => {
                  const timeStr = `${h}:${m}`;
                  const hour = parseInt(h);
                  const ampm = hour >= 12 ? 'PM' : 'AM';
                  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                  const isSelected = selectedHour === h && selectedMinute === m;
                  return (
                    <button
                      key={timeStr}
                      onClick={() => handleSelect(h, m)}
                      className={cn(
                        'px-2 py-1.5 text-xs rounded-lg transition-colors text-center',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-foreground'
                      )}
                    >
                      {display}:{m} {ampm}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
