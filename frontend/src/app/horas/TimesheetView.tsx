/**
 * 009 T027 (US1–US4). `/horas`: the timer, "Registrar horas", the range, and one's own timesheet
 * grouped by day.
 *
 * Totals are the server's (`totalMinutes`, `days`), never re-added here: the server computes them
 * from exactly the rows it lists (FR-010), and a second sum in the browser is a second chance to
 * disagree with it. Whether an entry is still correctable is the server's too (`correctableUntil`,
 * FR-015) — never inferred from the browser's clock.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/feedback/EmptyState';
import { ErrorState } from '@/feedback/ErrorState';
import { LoadingState } from '@/feedback/LoadingState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { can } from '@/authz/can';
import { longDay } from '@/calendar/format';
import { todayInMexico } from '@/calendar/month-grid';
import { getTimesheet } from '@/time/api';
import { formatMinutes } from '@/time/duration';
import { presetRange, rangeError, type DateRange, type RangePreset } from '@/time/range';
import type { TimeEntry, Timesheet } from '@/time/types';
import type { FailedResponse } from '@/lib/api-client';
import type { Archetype } from '@/session/types';
import { LogTimeDialog } from './LogTimeDialog';
import { TimerCard } from './TimerCard';
import { VoidEntryDialog } from './VoidEntryDialog';

export interface TimesheetViewProps {
  readonly archetype: Archetype;
  /** Injectable for tests; defaults to today in Mexico City. */
  readonly today?: string;
}

const PRESETS: readonly { readonly id: RangePreset; readonly label: string }[] = [
  { id: 'this-week', label: 'Esta semana' },
  { id: 'last-week', label: 'Semana anterior' },
  { id: 'this-month', label: 'Este mes' },
];

const SOURCE_LABEL: Readonly<Record<TimeEntry['source'], string>> = {
  timer: 'Cronómetro',
  manual: 'Manual',
};

type Dialog =
  | { readonly kind: 'create'; readonly key: number }
  | { readonly kind: 'edit'; readonly entry: TimeEntry; readonly key: number }
  | { readonly kind: 'void'; readonly entry: TimeEntry; readonly key: number };

function Heading(): React.JSX.Element {
  return (
    <h1 id="horas-heading" className="font-display text-display font-semibold tracking-tight">
      Registro de Horas
    </h1>
  );
}

export function TimesheetView({ archetype, today = todayInMexico() }: TimesheetViewProps): React.JSX.Element {
  if (!can('time.read_own', archetype)) {
    return (
      <section className="flex flex-col gap-2">
        <Heading />
        <p>Tu rol no registra horas en el despacho.</p>
      </section>
    );
  }
  return <Timesheet archetype={archetype} today={today} />;
}

function Timesheet({ archetype, today }: { archetype: Archetype; today: string }): React.JSX.Element {
  const [preset, setPreset] = useState<RangePreset | null>('this-week');
  const [range, setRange] = useState<DateRange>(() => presetRange('this-week', today));
  const [draft, setDraft] = useState<DateRange>(range);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const mayLog = can('time.log', archetype);
  const mayCorrect = can('time.correct_own', archetype);

  const sheet = useQuery<Timesheet, FailedResponse | null>({
    queryKey: ['time-sheet', range],
    queryFn: () => getTimesheet(range),
  });

  function choose(next: RangePreset) {
    const value = presetRange(next, today);
    setPreset(next);
    setRange(value);
    setDraft(value);
    setDraftError(null);
  }

  function applyCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = rangeError(draft);
    setDraftError(problem);
    if (problem) return;
    setPreset(null);
    setRange(draft);
  }

  const openCreate = () => setDialog({ kind: 'create', key: Date.now() });
  const byDay = (date: string) => (sheet.data?.items ?? []).filter((entry) => entry.workDate === date);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="horas-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Heading />
        {mayLog ? (
          <Button onClick={openCreate}>
            <Plus aria-hidden className="mr-2 h-4 w-4" />
            Registrar horas
          </Button>
        ) : null}
      </div>

      {mayLog ? <TimerCard /> : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo">
          {PRESETS.map((item) => (
            <Button
              key={item.id}
              variant={preset === item.id ? 'default' : 'outline'}
              aria-pressed={preset === item.id}
              onClick={() => choose(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <form onSubmit={applyCustom} noValidate className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="range-from">Desde</Label>
            <Input id="range-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="range-to">Hasta</Label>
            <Input id="range-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <Button type="submit" variant="outline">
            Aplicar
          </Button>
          {draftError ? (
            <p role="alert" className="basis-full text-sm text-destructive">
              {draftError}
            </p>
          ) : null}
        </form>
        <p className="text-small text-muted-foreground">La fecha final no se incluye en el periodo.</p>
      </div>

      {sheet.status === 'pending' ? (
        <LoadingState />
      ) : sheet.status === 'error' ? (
        <ErrorState refusal={classifyRefusal(sheet.error)} onRetry={() => void sheet.refetch()} />
      ) : (
        <>
          <p className="text-body">
            Total del periodo: <strong className="font-semibold">{formatMinutes(sheet.data.totalMinutes)}</strong>
          </p>
          {sheet.data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState guidance="No hay horas registradas en este periodo." />
              {mayLog ? (
                <Button variant="outline" onClick={openCreate}>
                  Registrar horas
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sheet.data.days.map((day) => (
                <section
                  key={day.date}
                  aria-labelledby={`horas-day-${day.date}`}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id={`horas-day-${day.date}`} className="font-display text-heading font-semibold first-letter:uppercase">
                      {longDay(day.date)}
                    </h2>
                    <span className="text-small text-muted-foreground">Total: {formatMinutes(day.minutes)}</span>
                  </div>
                  <ul className="flex flex-col gap-3">
                    {byDay(day.date).map((entry) => (
                      <li key={entry.id} className="flex flex-col gap-1 border-l-2 border-primary pl-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                            <Link href={`/expedientes/${entry.case.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                              {entry.case.fileNumber}
                            </Link>
                            <Badge variant="outline">{SOURCE_LABEL[entry.source]}</Badge>
                          </div>
                          <p className="break-words">{entry.description}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <span className="font-medium tabular-nums">{formatMinutes(entry.minutes)}</span>
                          {mayCorrect && entry.correctableUntil ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDialog({ kind: 'edit', entry, key: Date.now() })}
                                aria-label={`Corregir registro de ${formatMinutes(entry.minutes)} en ${entry.case.fileNumber}`}
                              >
                                Corregir
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDialog({ kind: 'void', entry, key: Date.now() })}
                                aria-label={`Eliminar registro de ${formatMinutes(entry.minutes)} en ${entry.case.fileNumber}`}
                              >
                                Eliminar
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {dialog?.kind === 'create' ? <LogTimeDialog key={dialog.key} mode="create" today={today} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'edit' ? (
        <LogTimeDialog key={dialog.key} mode="edit" entry={dialog.entry} today={today} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'void' ? <VoidEntryDialog key={dialog.key} entry={dialog.entry} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}
