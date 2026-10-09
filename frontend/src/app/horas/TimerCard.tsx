/**
 * 009 T027 (US1). The timer. It lives on the server (`GET …/timer`), so a reload, a second tab or a
 * second device all show the same one, and "one per person" is the server's rule, not this card's.
 *
 * Three states, three components. The running one is mounted with `key={timer.id}`, so its
 * description box is seeded once per timer — a refetch returns a new object for the same timer, and
 * re-seeding then would wipe what the person is typing.
 *
 * Matters are offered from `006`'s case list, which the server already narrows to the caller's
 * assignments — an unreachable matter is never offered, then refused.
 */
'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { Play, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { listCases } from '@/cases/api';
import type { CaseListResponse } from '@/cases/types';
import { discardTimer, getTimer, startTimer, stopTimer } from '@/time/api';
import { elapsedClock } from '@/time/duration';
import type { RunningTimer } from '@/time/types';
import type { FailedResponse } from '@/lib/api-client';

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm';

/** A refusal this card can explain in a sentence; anything else falls to `016a`'s error state. */
function refusalCopy(error: FailedResponse | null): string | null {
  const code = error?.body?.error?.code;
  if (code === 'timer_running') return 'Ya tienes un cronómetro en marcha.';
  if (code === 'timer_too_long') return 'El cronómetro lleva más de 24 horas; descártalo y registra el tiempo a mano.';
  if (code === 'no_running_timer') return 'Este cronómetro ya se detuvo.';
  if (error?.status === 404) return 'El expediente ya no está disponible.';
  return null;
}

type AnyMutation = UseMutationResult<unknown, FailedResponse | null, void>;

function Failure({ mutations }: { readonly mutations: readonly AnyMutation[] }): React.JSX.Element | null {
  const failed = mutations.find((m) => m.status === 'error');
  if (!failed) return null;
  const copy = refusalCopy(failed.error);
  return copy ? (
    <p role="alert" className="text-sm text-destructive">
      {copy}
    </p>
  ) : (
    <ErrorState refusal={classifyRefusal(failed.error)} onRetry={() => failed.reset()} />
  );
}

function useRefresh(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['time-timer'] });
    void queryClient.invalidateQueries({ queryKey: ['time-sheet'] });
  };
}

function useDiscard(): AnyMutation {
  const refresh = useRefresh();
  return useMutation<unknown, FailedResponse | null, void>({ mutationFn: () => discardTimer(), onSuccess: refresh });
}

function DiscardButton({ discard }: { readonly discard: AnyMutation }): React.JSX.Element {
  return (
    <Button variant="outline" onClick={() => discard.mutate()} disabled={discard.isPending}>
      <Trash2 aria-hidden className="mr-2 h-4 w-4" />
      Descartar
    </Button>
  );
}

export function TimerCard(): React.JSX.Element {
  const timer = useQuery<RunningTimer | null, FailedResponse | null>({ queryKey: ['time-timer'], queryFn: getTimer });
  const running = timer.data ?? null;

  return (
    <section aria-labelledby="timer-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h2 id="timer-heading" className="font-display text-heading font-semibold">
        Cronómetro
      </h2>
      {timer.status === 'error' ? (
        <ErrorState refusal={classifyRefusal(timer.error)} onRetry={() => void timer.refetch()} />
      ) : running && !running.caseAvailable ? (
        <OrphanTimer />
      ) : running ? (
        <Running key={running.id} timer={running} />
      ) : (
        <Idle />
      )}
    </section>
  );
}

/** FR-008: the matter is no longer reachable — the only thing left to do is discard. */
function OrphanTimer(): React.JSX.Element {
  const discard = useDiscard();
  return (
    <div className="flex flex-col gap-3">
      <p role="status">El expediente de este cronómetro ya no está disponible. Descártalo para poder iniciar otro.</p>
      <div>
        <DiscardButton discard={discard} />
      </div>
      <Failure mutations={[discard]} />
    </div>
  );
}

function Running({ timer }: { readonly timer: RunningTimer }): React.JSX.Element {
  const refresh = useRefresh();
  const [description, setDescription] = useState(timer.description ?? '');
  const [missingDescription, setMissingDescription] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const stop = useMutation<unknown, FailedResponse | null, void>({
    mutationFn: () => stopTimer(timer.case!.id, description.trim() || null),
    onSuccess: refresh,
  });
  const discard = useDiscard();

  function onStop() {
    if (!description.trim()) {
      setMissingDescription(true);
      return;
    }
    setMissingDescription(false);
    stop.mutate();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-medium">{timer.case!.fileNumber}</span>
        <span role="timer" aria-label="Tiempo transcurrido" className="font-mono text-heading tabular-nums">
          {elapsedClock(timer.startedAt, now)}
        </span>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="timer-description">Descripción del trabajo</Label>
        <Textarea
          id="timer-description"
          value={description}
          maxLength={1000}
          aria-invalid={missingDescription || undefined}
          aria-describedby={missingDescription ? 'timer-description-error' : undefined}
          onChange={(e) => setDescription(e.target.value)}
        />
        {missingDescription ? (
          <p id="timer-description-error" role="alert" className="text-sm text-destructive">
            Describe el trabajo realizado.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onStop} disabled={stop.isPending}>
          <Square aria-hidden className="mr-2 h-4 w-4" />
          Detener y registrar
        </Button>
        <DiscardButton discard={discard} />
      </div>
      <Failure mutations={[stop, discard]} />
    </div>
  );
}

function Idle(): React.JSX.Element {
  const refresh = useRefresh();
  const [caseId, setCaseId] = useState('');
  const [description, setDescription] = useState('');
  const cases = useQuery<CaseListResponse, FailedResponse | null>({
    queryKey: ['time-cases'],
    queryFn: () => listCases({ limit: 100 }),
  });
  const start = useMutation<unknown, FailedResponse | null, void>({
    mutationFn: () => startTimer(caseId, description.trim() || null),
    onSuccess: refresh,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="timer-case">Expediente del cronómetro</Label>
          <select id="timer-case" value={caseId} onChange={(e) => setCaseId(e.target.value)} className={SELECT_CLASS}>
            <option value="">Elige un expediente</option>
            {(cases.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.fileNumber} — {item.client.legalName}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="timer-description">Descripción del trabajo</Label>
          <Input
            id="timer-description"
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button onClick={() => start.mutate()} disabled={!caseId || start.isPending}>
          <Play aria-hidden className="mr-2 h-4 w-4" />
          Iniciar cronómetro
        </Button>
      </div>
      <Failure mutations={[start]} />
    </div>
  );
}
