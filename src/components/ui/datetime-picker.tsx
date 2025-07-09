'use client';

import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DateTimePickerProps {
  value?: Date;
  onChange?: (date?: Date) => void;
  hourCycle?: 12 | 24;
}

export function DateTimePicker({
  value,
  onChange,
  hourCycle = 12,
}: DateTimePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(value);
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);

  // Sync state when prop changes
  React.useEffect(() => {
    setDate(value);
  }, [value]);

  // When the date changes, propagate the change upward
  const handleDateChange = (newDate?: Date) => {
    if (!newDate) {
      setDate(undefined);
      onChange?.(undefined);
      return;
    }

    // Preserve the time when changing date
    const newDateTime = new Date(newDate);
    if (date) {
      newDateTime.setHours(date.getHours(), date.getMinutes(), 0, 0);
    }

    setDate(newDateTime);
    onChange?.(newDateTime);
  };

  // Handle hour selection
  const handleHourChange = (hour: string) => {
    if (!date) return;

    const newDate = new Date(date);
    
    if (hourCycle === 12) {
      // Convert 12-hour format to 24-hour
      const isPM = hour.includes('PM');
      let hourValue = parseInt(hour.replace(/\s?[AP]M/, ''), 10);
      
      if (isPM && hourValue < 12) {
        hourValue += 12;
      } else if (!isPM && hourValue === 12) {
        hourValue = 0;
      }
      
      newDate.setHours(hourValue);
    } else {
      // 24-hour format
      newDate.setHours(parseInt(hour, 10));
    }
    
    setDate(newDate);
    onChange?.(newDate);
  };

  // Handle minute selection
  const handleMinuteChange = (minute: string) => {
    if (!date) return;

    const newDate = new Date(date);
    newDate.setMinutes(parseInt(minute, 10));
    
    setDate(newDate);
    onChange?.(newDate);
  };

  // Format the displayed date
  const formatDisplayDate = (date?: Date) => {
    if (!date) return 'Pick a date and time';

    const formatStr = hourCycle === 12 ? 'PP, h:mm a' : 'PP, HH:mm';
    return format(date, formatStr);
  };

  // Generate the hours options based on the hour cycle
  const hours = React.useMemo(() => {
    if (hourCycle === 12) {
      return Array.from({ length: 12 }, (_, i) => {
        const hour = i === 0 ? 12 : i;
        return {
          value: `${hour} AM`,
          label: `${hour} AM`,
        };
      }).concat(
        Array.from({ length: 12 }, (_, i) => {
          const hour = i === 0 ? 12 : i;
          return {
            value: `${hour} PM`,
            label: `${hour} PM`,
          };
        })
      );
    }

    return Array.from({ length: 24 }, (_, i) => ({
      value: i.toString(),
      label: i.toString().padStart(2, '0'),
    }));
  }, [hourCycle]);

  // Generate the minutes options
  const minutes = React.useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => ({
      value: i.toString(),
      label: i.toString().padStart(2, '0'),
    }));
  }, []);

  // Get the current hour value for the Select
  const getSelectedHour = () => {
    if (!date) return '';

    const hours = date.getHours();
    if (hourCycle === 12) {
      const isPM = hours >= 12;
      const hour12 = hours % 12 || 12;
      return `${hour12} ${isPM ? 'PM' : 'AM'}`;
    }
    
    return hours.toString();
  };

  // Get the current minute value for the Select
  const getSelectedMinute = () => {
    return date ? date.getMinutes().toString() : '';
  };

  return (
    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatDisplayDate(date)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDateChange}
          initialFocus
        />
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex justify-between">
            <div className="flex flex-col">
              <div className="text-xs text-muted-foreground mb-1">
                Hour
              </div>
              <Select
                value={getSelectedHour()}
                onValueChange={handleHourChange}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Hour" />
                </SelectTrigger>
                <SelectContent position="popper" className="h-[300px]">
                  {hours.map((hour) => (
                    <SelectItem key={hour.value} value={hour.value}>
                      {hour.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col">
              <div className="text-xs text-muted-foreground mb-1">
                Minute
              </div>
              <Select
                value={getSelectedMinute()}
                onValueChange={handleMinuteChange}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Minute" />
                </SelectTrigger>
                <SelectContent position="popper" className="h-[300px]">
                  {minutes.map((minute) => (
                    <SelectItem key={minute.value} value={minute.value}>
                      {minute.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => setIsCalendarOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
} 