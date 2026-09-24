/**
 * 013 T015. `/calendario`: reminders on top, the month grid, and the selected day's list.
 *
 * One events request per month shown, for exactly the grid's range (SC-001). A role without
 * `calendar.read` (BM) is told so and nothing is requested — the API would refuse anyway.
 */
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { can } from '@/authz/can';
import { listEvents } from '@/calendar/api';
import { monthTitle } from '@/calendar/format';
import { eventsByDay, gridDays, gridRange, shiftMonth, todayInMexico, type YearMonth } from '@/calendar/month-grid';
import type { CalendarEvent } from '@/calendar/types';
import type { FailedResponse } from '@/lib/api-client';
import type { Archetype } from '@/session/types';
import { CancelEventDialog } from './CancelEventDialog';
import { DayList } from './DayList';
import { EventDialog } from './EventDialog';
import { MonthGrid } from './MonthGrid';
import { RemindersPanel } from './RemindersPanel';

export interface CalendarViewProps {
  readonly archetype: Archetype;
  /** Injectable for tests; defaults to today in Mexico City. */
  readonly today?: string;
}

type Editing = { readonly mode: 'create'; readonly key: number } | { readonly mode: 'edit'; readonly event: CalendarEvent; readonly key: number };

export function CalendarView({ archetype, today = todayInMexico() }: CalendarViewProps): React.JSX.Element {
  const mayRead = can('calendar.read', archetype);
  if (!mayRead) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-display font-semibold tracking-tight">Calendario</h1>
        <p>Tu rol no tiene acceso al calendario del despacho.</p>
      </section>
    );
  }
  return <Calendar archetype={archetype} today={today} />;
}

function Calendar({ archetype, today }: { archetype: Archetype; today: string }): React.JSX.Element {
  const [month, setMonth] = useState<YearMonth>({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const [selected, setSelected] = useState(today);
  const [showCancelled, setShowCancelled] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [cancelling, setCancelling] = useState<CalendarEvent | null>(null);
  const mayManage = can('calendar.manage', archetype);

  const days = useMemo(() => gridDays(month.year, month.month), [month]);
  const range = useMemo(() => gridRange(month.year, month.month), [month]);

  const query = useQuery<readonly CalendarEvent[], FailedResponse | null>({
    queryKey: ['calendar-events', range, showCancelled],
    queryFn: () => listEvents(range, showCancelled),
  });
  const byDay = useMemo(() => eventsByDay(query.data ?? []), [query.data]);

  function goTo(next: YearMonth) {
    setMonth(next);
    const first = `${next.year}-${String(next.month).padStart(2, '0')}-01`;
    setSelected(today.slice(0, 7) === first.slice(0, 7) ? today : first);
  }

  function openDay(date: string) {
    setSelected(date);
    setMonth({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) });
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="calendario-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="calendario-heading" className="font-display text-display font-semibold tracking-tight">
          Calendario
        </h1>
        {mayManage ? (
          <Button onClick={() => setEditing({ mode: 'create', key: Date.now() })}>
            <Plus aria-hidden className="mr-2 h-4 w-4" />
            Nuevo evento
          </Button>
        ) : null}
      </div>

      <RemindersPanel onOpenDay={openDay} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => goTo(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </Button>
          <h2 className="min-w-44 text-center font-display text-heading font-semibold first-letter:uppercase">
            {monthTitle(month.year, month.month)}
          </h2>
          <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => goTo(shiftMonth(month, 1))}>
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={() => openDay(today)}>
            Hoy
          </Button>
        </div>
        <Button variant="outline" aria-pressed={showCancelled} onClick={() => setShowCancelled((v) => !v)}>
          {showCancelled ? 'Ocultar cancelados' : 'Mostrar cancelados'}
        </Button>
      </div>

      {query.status === 'error' ? (
        <ErrorState refusal={classifyRefusal(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <MonthGrid days={days} eventsByDay={byDay} today={today} selected={selected} onSelect={setSelected} />
          <DayList
            date={selected}
            events={byDay.get(selected) ?? []}
            mayManage={mayManage}
            onEdit={(event) => setEditing({ mode: 'edit', event, key: Date.now() })}
            onCancel={setCancelling}
          />
        </div>
      )}

      {editing?.mode === 'create' ? (
        <EventDialog key={editing.key} open mode="create" date={selected} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />
      ) : null}
      {editing?.mode === 'edit' ? (
        <EventDialog key={editing.key} open mode="edit" event={editing.event} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />
      ) : null}
      {cancelling ? <CancelEventDialog event={cancelling} onClose={() => setCancelling(null)} /> : null}
    </section>
  );
}
