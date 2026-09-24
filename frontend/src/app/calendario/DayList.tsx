/**
 * 013 T015 (US1, US3). The selected day's events, in time order (all-day first).
 *
 * A case-linked event names the case and links to its documents (US1 scenario 3). "Editar" and
 * "Cancelar" are drawn for `calendar.manage` on scheduled events only; a cancelled event reads
 * "Cancelado" and is struck through.
 */
'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, eventTimeLabel, longDay } from '@/calendar/format';
import type { CalendarEvent } from '@/calendar/types';

export interface DayListProps {
  readonly date: string;
  readonly events: readonly CalendarEvent[];
  readonly mayManage: boolean;
  readonly onEdit: (event: CalendarEvent) => void;
  readonly onCancel: (event: CalendarEvent) => void;
}

export function DayList({ date, events, mayManage, onEdit, onCancel }: DayListProps): React.JSX.Element {
  const title = longDay(date);
  const headingId = `day-${date}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 id={headingId} className="font-display text-heading font-semibold first-letter:uppercase">
        {title}
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay eventos este día.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const cancelled = event.status === 'cancelled';
            return (
              <li key={event.id} className="flex flex-col gap-1 border-l-2 border-primary pl-3">
                <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                  <span>{eventTimeLabel(event)}</span>
                  <Badge variant="outline">{EVENT_TYPE_LABEL[event.type]}</Badge>
                  {cancelled ? <Badge variant="secondary">Cancelado</Badge> : null}
                </div>
                <p className={cn('font-medium', cancelled && 'line-through opacity-70')}>{event.title}</p>
                {event.location ? <p className="text-small text-muted-foreground">{event.location}</p> : null}
                {event.case ? (
                  <Link
                    href={`/expedientes/${event.case.id}/documentos`}
                    className="w-fit text-small text-primary underline-offset-4 hover:underline"
                  >
                    {event.case.fileNumber}
                  </Link>
                ) : null}
                {mayManage && !cancelled ? (
                  <div className="mt-1 flex gap-2">
                    <Button variant="outline" size="sm" aria-label={`Editar ${event.title}`} onClick={() => onEdit(event)}>
                      Editar
                    </Button>
                    <Button variant="outline" size="sm" aria-label={`Cancelar ${event.title}`} onClick={() => onCancel(event)}>
                      Cancelar
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
