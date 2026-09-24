/**
 * 013 T015 (US1). The month as a Monday-first grid; each day is one button that selects it.
 *
 * A day's button names the date and how many events it holds, so a screen-reader user hears
 * "23 de septiembre, 2 eventos" rather than a bare number. Today carries `aria-current="date"`.
 * At most three events show per day; the rest are counted.
 */
'use client';

import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, dayMonth } from '@/calendar/format';
import type { GridDay } from '@/calendar/month-grid';
import type { CalendarEvent } from '@/calendar/types';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const SHOWN = 3;

export interface MonthGridProps {
  readonly days: readonly GridDay[];
  readonly eventsByDay: ReadonlyMap<string, readonly CalendarEvent[]>;
  readonly today: string;
  readonly selected: string;
  readonly onSelect: (date: string) => void;
}

export function MonthGrid({ days, eventsByDay, today, selected, onSelect }: MonthGridProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border text-center text-caption uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2" aria-hidden>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const events = eventsByDay.get(day.date) ?? [];
          const count = events.length;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelect(day.date)}
              aria-current={day.date === today ? 'date' : undefined}
              aria-pressed={day.date === selected}
              aria-label={`${dayMonth(day.date)}, ${count === 0 ? 'sin eventos' : count === 1 ? '1 evento' : `${count} eventos`}`}
              className={cn(
                'flex min-h-24 flex-col gap-1 border-b border-r border-border p-1.5 text-left align-top transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !day.inMonth && 'bg-muted/40 text-muted-foreground',
                day.date === selected && 'bg-accent/15',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-small',
                  day.date === today && 'bg-primary font-semibold text-primary-foreground',
                )}
              >
                {Number(day.date.slice(8))}
              </span>
              {events.slice(0, SHOWN).map((event) => (
                <span
                  key={event.id}
                  className={cn(
                    'truncate rounded-sm bg-primary/10 px-1 text-caption text-foreground',
                    event.type === 'deadline' && 'bg-destructive/10',
                    event.status === 'cancelled' && 'line-through opacity-60',
                  )}
                  title={`${EVENT_TYPE_LABEL[event.type]}: ${event.title}`}
                >
                  {event.title}
                </span>
              ))}
              {count > SHOWN ? <span className="text-caption text-muted-foreground">+{count - SHOWN} más</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
