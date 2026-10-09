/**
 * 009 T027 (US4). "Eliminar" is a void: confirmed, and the confirmation says the record is kept
 * (FR-012, Principle V) — the same honesty `013`'s cancel dialog shows.
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
import { voidEntry } from '@/time/api';
import { formatMinutes } from '@/time/duration';
import type { TimeEntry } from '@/time/types';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';

function refusalCopy(error: FailedResponse | null): string | null {
  const code = error?.body?.error?.code;
  if (code === 'correction_window_closed') return 'Ya pasaron las 24 horas; este registro ya no se puede eliminar.';
  if (code === 'entry_voided') return 'Este registro ya fue eliminado.';
  if (error?.status === 404) return 'Este registro ya no está disponible.';
  return null;
}

export function VoidEntryDialog({
  entry,
  onClose,
}: {
  readonly entry: TimeEntry;
  readonly onClose: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const remove = useMutation<{ id: string }, FailedResponse | null, void>({
    mutationFn: () => voidEntry(entry.case.id, entry.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-sheet'] });
      onClose();
    },
  });
  const copy = remove.status === 'error' ? refusalCopy(remove.error) : null;

  return (
    <AlertDialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent {...anchor}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
          <AlertDialogDescription>
            {formatMinutes(entry.minutes)} en {entry.case.fileNumber}. Deja de contar en tus horas, pero se conserva en
            el historial como eliminado.
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
            {remove.isPending ? 'Eliminando…' : 'Eliminar registro'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
