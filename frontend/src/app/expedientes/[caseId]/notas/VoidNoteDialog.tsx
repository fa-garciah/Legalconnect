/**
 * 008 (US3). "Eliminar" is a void (Decision 3): confirmed, and the confirmation says the record is
 * kept — the same honesty as 009's `VoidEntryDialog`.
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { voidNote } from '@/notes/api';
import type { Note } from '@/notes/types';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { noteRefusalCopy } from './refusal-copy';

export function VoidNoteDialog({
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
  const remove = useMutation<{ id: string }, FailedResponse | null, void>({
    mutationFn: () => voidNote(caseId, note.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['case-notes', caseId] });
      onClose();
    },
  });
  const copy = remove.status === 'error' ? noteRefusalCopy(remove.error, 'eliminar') : null;

  return (
    <AlertDialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent {...anchor}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar esta nota?</AlertDialogTitle>
          <AlertDialogDescription>
            Deja de mostrarse en el expediente, pero se conserva en el historial como eliminada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.status === 'error' ? (
          copy ? (
            <p role="alert" className="text-sm text-destructive">
              {copy}
            </p>
          ) : (
            <ErrorState refusal={classifyRefusal(remove.error)} onRetry={() => remove.mutate()} />
          )
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault();
              remove.mutate();
            }}
          >
            {remove.isPending ? 'Eliminando…' : 'Eliminar nota'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
