/**
 * 008 (US5). `/expedientes/{caseId}/actividad`: what changed on the matter, one Mexico City month at a
 * time, as Spanish sentences by position. Kinds of change only — the API sends no value to show.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/feedback/EmptyState';
import { ErrorState } from '@/feedback/ErrorState';
import { LoadingState } from '@/feedback/LoadingState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { can } from '@/authz/can';
import { getActivity } from '@/notes/api';
import { describeActivity } from '@/notes/activity-copy';
import { mexicoMonth, momentLabel } from '@/notes/month';
import type { ActivityFeed } from '@/notes/types';
import type { FailedResponse } from '@/lib/api-client';
import type { Archetype } from '@/session/types';
import { MonthStepper } from '../MonthStepper';

export interface ActivityViewProps {
  readonly caseId: string;
  readonly archetype: Archetype;
  /** Injectable for tests; defaults to the current Mexico City month. */
  readonly month?: string;
}

function Heading(): React.JSX.Element {
  return (
    <h1 id="actividad-heading" className="font-display text-display font-semibold tracking-tight">
      Actividad del expediente
    </h1>
  );
}

export function ActivityView({ caseId, archetype, month = mexicoMonth() }: ActivityViewProps): React.JSX.Element {
  if (!can('case.read_activity', archetype)) {
    return (
      <section className="flex flex-col gap-2">
        <Heading />
        <p>Tu rol no consulta la actividad de los expedientes.</p>
      </section>
    );
  }
  return <Activity caseId={caseId} archetype={archetype} initialMonth={month} />;
}

function Activity({
  caseId,
  archetype,
  initialMonth,
}: {
  readonly caseId: string;
  readonly archetype: Archetype;
  readonly initialMonth: string;
}): React.JSX.Element {
  const [month, setMonth] = useState(initialMonth);
  const feed = useQuery<ActivityFeed, FailedResponse | null>({
    queryKey: ['case-activity', caseId, month],
    queryFn: () => getActivity(caseId, month),
  });

  return (
    <section className="flex flex-col gap-6" aria-labelledby="actividad-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Heading />
        <nav className="flex gap-4 text-small" aria-label="Expediente">
          <Link href="/expedientes" className="underline-offset-4 hover:underline">
            Volver a expedientes
          </Link>
          {can('note.read', archetype) ? (
            <Link href={`/expedientes/${caseId}/notas`} className="underline-offset-4 hover:underline">
              Notas
            </Link>
          ) : null}
        </nav>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="actividad-month">
        <MonthStepper month={month} onChange={setMonth} headingId="actividad-month" />
        {feed.status === 'pending' ? (
          <LoadingState />
        ) : feed.status === 'error' ? (
          <ErrorState refusal={classifyRefusal(feed.error)} onRetry={() => void feed.refetch()} />
        ) : feed.data.items.length === 0 ? (
          <EmptyState guidance="No hubo cambios en este expediente en este mes." />
        ) : (
          <>
            {feed.data.truncated ? (
              <p className="text-small text-muted-foreground">Se muestran los 200 cambios más recientes de este mes.</p>
            ) : null}
            <ol className="flex flex-col gap-3">
              {feed.data.items.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 border-l-2 border-primary pl-3">
                  <p>{describeActivity(entry)}</p>
                  <time dateTime={entry.occurredAt} className="text-small text-muted-foreground">
                    {momentLabel(entry.occurredAt)}
                  </time>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </section>
  );
}
