/**
 * 024 (US1–US3). `/` — what is open, what is due and what moved, on the matters the person reaches.
 *
 * Every figure is the server's (`GET /tenant/dashboard`), computed in one transaction; nothing is
 * re-derived here, including "today" (Decision 7). Firm-wide KPIs are not repeated: holders of
 * `kpi.read` get a link to `/kpis` (Decision 1). Past deadlines are shown as past, with the reason the
 * product cannot call them overdue (Decision 2). No revenue figure exists to show (Decision 6).
 */
'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/feedback/EmptyState';
import { ErrorState } from '@/feedback/ErrorState';
import { LoadingState } from '@/feedback/LoadingState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { can } from '@/authz/can';
import { EVENT_TYPE_LABEL, dayMonth, formatTime } from '@/calendar/format';
import { getDashboard } from '@/dashboard/api';
import type { Dashboard, EventSummary } from '@/dashboard/types';
import { describeActivity } from '@/notes/activity-copy';
import { momentLabel } from '@/notes/month';
import { formatMinutes } from '@/time/duration';
import type { FailedResponse } from '@/lib/api-client';
import type { Archetype } from '@/session/types';

function Heading(): React.JSX.Element {
  return (
    <h1 id="dashboard-heading" className="font-display text-display font-semibold tracking-tight">
      Dashboard Principal
    </h1>
  );
}

export function DashboardView({ archetype }: { readonly archetype: Archetype }): React.JSX.Element {
  if (!can('dashboard.read', archetype)) {
    // Decision 8: a welcome, not a refusal — and no request the server would refuse.
    return (
      <section className="flex flex-col gap-3">
        <Heading />
        <p>Bienvenido a LegalConnect MX.</p>
        {can('client.read', archetype) ? (
          <Link href="/clientes" className="w-fit font-medium text-primary underline-offset-4 hover:underline">
            Ir a Clientes
          </Link>
        ) : null}
      </section>
    );
  }
  return <Board archetype={archetype} />;
}

function Board({ archetype }: { readonly archetype: Archetype }): React.JSX.Element {
  const board = useQuery<Dashboard, FailedResponse | null>({ queryKey: ['dashboard'], queryFn: getDashboard });

  return (
    <section className="flex flex-col gap-6" aria-labelledby="dashboard-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Heading />
        {can('kpi.read', archetype) ? (
          <Link href="/kpis" className="text-small font-medium text-primary underline-offset-4 hover:underline">
            Ver indicadores del despacho
          </Link>
        ) : null}
      </div>

      {board.status === 'pending' ? (
        <LoadingState />
      ) : board.status === 'error' ? (
        <ErrorState refusal={classifyRefusal(board.error)} onRetry={() => void board.refetch()} />
      ) : (
        <Content data={board.data} />
      )}
    </section>
  );
}

function Content({ data }: { readonly data: Dashboard }): React.JSX.Element {
  return (
    <>
      <section aria-labelledby="dashboard-tiles" className="flex flex-col gap-3">
        <h2 id="dashboard-tiles" className="sr-only">
          Resumen de hoy
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile value={String(data.activeMatters)} label="Expedientes activos" href="/expedientes" />
          <Tile value={String(data.todayEvents.length)} label="Eventos de hoy" href="/calendario" />
          {data.myMinutesToday !== null ? (
            <Tile value={formatMinutes(data.myMinutesToday)} label="Mis horas de hoy" href="/horas" />
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="dashboard-today" title="Hoy">
          <EventList events={data.todayEvents} empty="No hay eventos para hoy." showTime />
        </Panel>
        <Panel id="dashboard-upcoming" title="Plazos próximos">
          <EventList events={data.deadlines.upcoming} empty="No hay plazos en los próximos 7 días." />
        </Panel>
        <Panel id="dashboard-recent" title="Plazos de los últimos 7 días">
          <p className="text-small text-muted-foreground">
            El sistema no registra si un plazo se cumplió; confirma que estos se atendieron.
          </p>
          <EventList events={data.deadlines.recent} empty="No hubo plazos en los últimos 7 días." />
        </Panel>
        <Panel id="dashboard-activity" title="Actividad reciente">
          {data.recentActivity.length === 0 ? (
            <EmptyState guidance="No hubo cambios en tus expedientes en los últimos 30 días." />
          ) : (
            <ol className="flex flex-col gap-3">
              {data.recentActivity.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 border-l-2 border-primary pl-3">
                  <p>{describeActivity(entry)}</p>
                  <div className="flex flex-wrap gap-2 text-small text-muted-foreground">
                    <Link
                      href={`/expedientes/${entry.case.id}/actividad`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {entry.case.fileNumber}
                    </Link>
                    <time dateTime={entry.occurredAt}>{momentLabel(entry.occurredAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}

function Tile({ value, label, href }: { readonly value: string; readonly label: string; readonly href: string }): React.JSX.Element {
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 hover:bg-accent">
      <span className="font-display text-display font-semibold tabular-nums">{value}</span>
      <span className="text-small text-muted-foreground">{label}</span>
    </Link>
  );
}

function Panel({ id, title, children }: { readonly id: string; readonly title: string; readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 id={id} className="font-display text-heading font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function when(event: EventSummary, showTime: boolean): string {
  if (showTime) return event.allDay || !event.startsAt ? 'Todo el día' : formatTime(event.startsAt);
  return event.startsOn ? dayMonth(event.startsOn) : event.startsAt ? momentLabel(event.startsAt) : '';
}

function EventList({
  events,
  empty,
  showTime = false,
}: {
  readonly events: readonly EventSummary[];
  readonly empty: string;
  readonly showTime?: boolean;
}): React.JSX.Element {
  if (events.length === 0) return <EmptyState guidance={empty} />;
  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="flex flex-col gap-1">
          <span className="font-medium">{event.title}</span>
          <div className="flex flex-wrap gap-2 text-small text-muted-foreground">
            <span>{EVENT_TYPE_LABEL[event.type]}</span>
            <span>{when(event, showTime)}</span>
            {event.case ? <span>{event.case.fileNumber}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
