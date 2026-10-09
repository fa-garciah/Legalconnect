/**
 * 008 (US1, US2, US3). `/expedientes/{caseId}/notas`: the matter's internal notes, one Mexico City
 * month at a time, a composer, and — on one's own note, while the server says the 24-hour window is
 * open — "Corregir" and "Eliminar".
 *
 * Every note is internal (Decision 1): nothing here offers a visibility, because there is only one.
 * Whether the caller reaches this matter is the API's decision; a `404` renders the classifier's copy
 * unchanged, which is what keeps it opaque.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/feedback/EmptyState';
import { ErrorState } from '@/feedback/ErrorState';
import { LoadingState } from '@/feedback/LoadingState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { can } from '@/authz/can';
import { listNotes } from '@/notes/api';
import { mexicoMonth, momentLabel } from '@/notes/month';
import type { Note, NoteList } from '@/notes/types';
import type { FailedResponse } from '@/lib/api-client';
import type { Archetype } from '@/session/types';
import { MonthStepper } from '../MonthStepper';
import { CorrectNoteDialog } from './CorrectNoteDialog';
import { NoteComposer } from './NoteComposer';
import { VoidNoteDialog } from './VoidNoteDialog';

export interface NotesViewProps {
  readonly caseId: string;
  readonly archetype: Archetype;
  /** Injectable for tests; defaults to the current Mexico City month. */
  readonly month?: string;
}

type Dialog =
  | { readonly kind: 'edit'; readonly note: Note; readonly key: number }
  | { readonly kind: 'void'; readonly note: Note; readonly key: number };

function Heading(): React.JSX.Element {
  return (
    <h1 id="notas-heading" className="font-display text-display font-semibold tracking-tight">
      Notas del expediente
    </h1>
  );
}

export function NotesView({ caseId, archetype, month = mexicoMonth() }: NotesViewProps): React.JSX.Element {
  if (!can('note.read', archetype)) {
    return (
      <section className="flex flex-col gap-2">
        <Heading />
        <p>Tu rol no consulta las notas de los expedientes.</p>
      </section>
    );
  }
  return <Notes caseId={caseId} archetype={archetype} initialMonth={month} />;
}

function Notes({
  caseId,
  archetype,
  initialMonth,
}: {
  readonly caseId: string;
  readonly archetype: Archetype;
  readonly initialMonth: string;
}): React.JSX.Element {
  const [month, setMonth] = useState(initialMonth);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const mayCorrect = can('note.correct_own', archetype);

  const notes = useQuery<NoteList, FailedResponse | null>({
    queryKey: ['case-notes', caseId, month],
    queryFn: () => listNotes(caseId, month),
    // Every interactive read writes one `note.list_read` (Decision 4): a window focus is not a read.
    refetchOnWindowFocus: false,
  });

  return (
    <section className="flex flex-col gap-6" aria-labelledby="notas-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Heading />
        <nav className="flex gap-4 text-small" aria-label="Expediente">
          <Link href="/expedientes" className="underline-offset-4 hover:underline">
            Volver a expedientes
          </Link>
          {can('case.read_activity', archetype) ? (
            <Link href={`/expedientes/${caseId}/actividad`} className="underline-offset-4 hover:underline">
              Actividad
            </Link>
          ) : null}
        </nav>
      </div>

      <p className="text-small text-muted-foreground">
        Las notas son internas del despacho: solo las ve el equipo del expediente.
      </p>

      {can('note.create', archetype) ? <NoteComposer caseId={caseId} /> : null}

      <section className="flex flex-col gap-4" aria-labelledby="notas-month">
        <MonthStepper month={month} onChange={setMonth} headingId="notas-month" />
        {notes.status === 'pending' ? (
          <LoadingState />
        ) : notes.status === 'error' ? (
          <ErrorState refusal={classifyRefusal(notes.error)} onRetry={() => void notes.refetch()} />
        ) : notes.data.items.length === 0 ? (
          <EmptyState guidance="No hay notas en este mes." />
        ) : (
          <div className="flex flex-col gap-3">
            {notes.data.items.map((note) => (
              <article key={note.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                  <span className="font-medium text-foreground">{note.author.position ?? 'Integrante del despacho'}</span>
                  <time dateTime={note.createdAt}>{momentLabel(note.createdAt)}</time>
                  {note.own ? <Badge variant="outline">Tuya</Badge> : null}
                </div>
                <p className="whitespace-pre-wrap break-words">{note.body}</p>
                {mayCorrect && note.correctableUntil ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'edit', note, key: Date.now() })}>
                      Corregir
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'void', note, key: Date.now() })}>
                      Eliminar
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {dialog?.kind === 'edit' ? (
        <CorrectNoteDialog key={dialog.key} caseId={caseId} note={dialog.note} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'void' ? (
        <VoidNoteDialog key={dialog.key} caseId={caseId} note={dialog.note} onClose={() => setDialog(null)} />
      ) : null}
    </section>
  );
}
