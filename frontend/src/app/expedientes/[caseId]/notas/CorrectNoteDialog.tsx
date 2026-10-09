/**
 * 008 (US3). Correcting one's own note within 24 hours (Decision 3). Only the text moves.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { correctNote } from '@/notes/api';
import { noteBodyError } from '@/notes/schema';
import type { Note } from '@/notes/types';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { noteRefusalCopy } from './refusal-copy';

export function CorrectNoteDialog({
  caseId,
  note,
  onClose,
}: {
  readonly caseId: string;
  readonly note: Note;
  readonly onClose: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const [body, setBody] = useState(note.body);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation<Note, FailedResponse | null, string>({
    mutationFn: (text) => correctNote(caseId, note.id, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['case-notes', caseId] });
      onClose();
    },
  });
  const copy = save.status === 'error' ? noteRefusalCopy(save.error, 'corregir') : null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = noteBodyError(body);
    setProblem(error);
    if (!error) save.mutate(body.trim());
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent {...anchor}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Corregir nota</DialogTitle>
            <DialogDescription>Puedes corregir tus notas durante las primeras 24 horas.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nota-correccion">Texto de la nota</Label>
            <Textarea id="nota-correccion" value={body} rows={6} onChange={(e) => setBody(e.target.value)} />
            {problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : null}
          </div>
          {save.status === 'error' ? (
            copy ? (
              <p role="alert" className="text-sm text-destructive">
                {copy}
              </p>
            ) : (
              <ErrorState refusal={classifyRefusal(save.error)} onRetry={() => save.mutate(body.trim())} />
            )
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Guardar corrección'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
