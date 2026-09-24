/**
 * 013 T015 (US4, Decision 2). In-app reminders: the events whose reminder time has passed and whose
 * start has not. Computed by the API on read; nothing is sent anywhere, because no channel exists.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { listReminders } from '@/calendar/api';
import { EVENT_TYPE_LABEL, dayMonth, eventTimeLabel } from '@/calendar/format';
import { mexicoDate } from '@/calendar/month-grid';
import type { CalendarEvent } from '@/calendar/types';
import type { FailedResponse } from '@/lib/api-client';

export function RemindersPanel({ onOpenDay }: { readonly onOpenDay: (date: string) => void }): React.JSX.Element {
  const query = useQuery<readonly CalendarEvent[], FailedResponse | null>({
    queryKey: ['calendar-reminders'],
    queryFn: listReminders,
    refetchInterval: 60_000,
  });
  const items = query.data ?? [];

  return (
    <section aria-labelledby="reminders-heading" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <BellRing aria-hidden className="h-4 w-4 text-accent" />
        <h2 id="reminders-heading" className="font-display text-heading font-semibold">
          Recordatorios
        </h2>
        <Badge variant={items.length > 0 ? 'default' : 'outline'} aria-label={`${items.length} pendientes`}>
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay recordatorios pendientes.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((event) => {
            const date = event.allDay ? event.startsOn! : mexicoDate(event.startsAt!);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onOpenDay(date)}
                  className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium">{event.title}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {EVENT_TYPE_LABEL[event.type]} · {dayMonth(date)} · {eventTimeLabel(event)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
