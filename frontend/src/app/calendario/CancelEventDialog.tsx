/**
 * 013 T015 (US3). Cancelling an event: confirmed, and the confirmation says it is kept (FR-008).
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
import { cancelEvent } from '@/calendar/api';
import type { CalendarEvent } from '@/calendar/types';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';

export function CancelEventDialog({
  event,
  onClose,
}: {
  readonly event: CalendarEvent;
  readonly onClose: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const cancel = useMutation<CalendarEvent, FailedResponse | null, void>({
    mutationFn: () => cancelEvent(event.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar-reminders'] });
      onClose();
    },
  });
  const alreadyCancelled = cancel.error?.body?.error?.code === 'event_cancelled';

  return (
    <AlertDialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent {...anchor}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar este evento?</AlertDialogTitle>
          <AlertDialogDescription>
            {event.title}. Se conserva en el historial como cancelado; no se borra.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {cancel.status === 'error' ? (
          alreadyCancelled ? (
            <p role="alert" className="text-sm text-destructive">
              Otra persona ya canceló este evento.
            </p>
          ) : (
            <ErrorState refusal={classifyRefusal(cancel.error)} onRetry={() => cancel.mutate()} />
          )
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={cancel.isPending}
            onClick={(e) => {
              e.preventDefault();
              cancel.mutate();
            }}
          >
            {cancel.isPending ? 'Cancelando…' : 'Cancelar evento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
