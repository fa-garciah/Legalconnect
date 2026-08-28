/**
 * T041 — withdrawing a client, and undoing it (018/US3).
 *
 * **One component for both, because they are one capability.** `006/FR-004a` puts withdraw
 * and restore on the same matrix row: whoever may take a party out of circulation may put
 * them back. Two components would invite two answers to a question that has one.
 *
 * **They are not symmetric, though.** Withdrawal confirms before sending anything (FR-012);
 * restore does not. Restore *is* the undo — the reason `006/FR-004a` exists is that without
 * it a mis-click permanently bars a party and the only remedy is a duplicate record — and
 * putting a confirmation in front of an undo asks someone to reaffirm the action they took
 * to correct themselves.
 *
 * **The confirmation says both halves of what happens.** "No new matters" and "existing
 * matters unaffected". The second is not reassurance padding: withdrawal *sounds*
 * destructive, `006/FR-008` guarantees it is not, and a message that stated only the first
 * half would make people hesitate over a narrow, reversible change — or avoid it, and leave
 * a stale party in the directory instead.
 */
'use client';

import { useEffect, useState } from 'react';
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
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { deactivateClient, reactivateClient } from '@/clients/api';
import type { Client, ClientStatusChangeResponse } from '@/clients/types';

export type WithdrawAction = 'withdraw' | 'restore';

export interface WithdrawDialogProps {
  readonly open: boolean;
  readonly action: WithdrawAction;
  readonly client: Client;
  readonly onClose: () => void;
  readonly onDone: () => void;
}

export function WithdrawDialog({
  open,
  action,
  client,
  onClose,
  onDone,
}: WithdrawDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<FailedResponse | null | undefined>(undefined);
  // Same reason as the form dialog: focus and scroll position have to be put back by hand.
  const anchor = useDialogAnchor(open);

  const run = useMutation<ClientStatusChangeResponse, FailedResponse | null, void>({
    mutationFn: () =>
      action === 'withdraw' ? deactivateClient(client.id) : reactivateClient(client.id),
    onSuccess: () => {
      // Re-read rather than patch: the directory shows what 006 holds, not what the browser
      // assumed it would hold.
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      onDone();
      onClose();
    },
    onError: (failed) => {
      setRefusal(failed);

      /*
       * contracts/client-screens.md §3.3. `already_deactivated` and `already_active` both
       * mean the same thing from here: a colleague changed this record between the control
       * being drawn and being pressed. 006 refuses rather than accepting silently, so the
       * audit trail never gains a withdrawal that withdrew nothing — and the screen
       * re-reads, because leaving the row claiming the old status is how the next person
       * presses the same button.
       */
      const code = failed?.body.error.code;
      if (code === 'already_deactivated' || code === 'already_active') {
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
      }
    },
  });

  /*
   * Restore has no confirmation step, so opening the dialog IS the action.
   *
   * `mutate` is not a `setState` — it starts a request — so this is not the cascading-render
   * pattern the effect lint guards against. It lives in an effect rather than in the
   * caller's click handler so both actions share one call site and one refusal path; a
   * caller that fired restore itself would have to duplicate all of it.
   *
   * **`isIdle` is only a correct guard because the caller keys this component per opening.**
   * The mutation is idle exactly once per mount, so this fires exactly once per attempt.
   * Without that key it fires once per *component lifetime*, and the second attempt —
   * restoring a client this same dialog just withdrew — does nothing at all. See
   * `ClientDirectory`'s `token`.
   */
  useEffect(() => {
    if (open && action === 'restore' && run.isIdle) {
      run.mutate();
    }
    // `run` is recreated each render; depending on it would re-fire the mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action]);

  if (action === 'restore') {
    /*
     * Nothing to confirm, so nothing to show — unless it was refused, which is the one
     * thing the person needs to see. Rendered in a dialog anyway so the refusal has
     * somewhere to live and a way to be dismissed.
     */
    return (
      <AlertDialog open={open && refusal !== undefined} onOpenChange={(next) => (next ? undefined : onClose())}>
        <AlertDialogContent {...anchor}>
          <AlertDialogHeader>
            <AlertDialogTitle>No se pudo restaurar</AlertDialogTitle>
            <AlertDialogDescription>{client.legalName}</AlertDialogDescription>
          </AlertDialogHeader>
          {refusal !== undefined ? (
            <ErrorState refusal={classifyRefusal(refusal)} onRetry={() => run.mutate()} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onClose}>Cerrar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent {...anchor}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Retirar a {client.legalName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Este cliente no podrá usarse en nuevos asuntos. Los asuntos existentes no se ven
            afectados.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {refusal !== undefined ? (
          <ErrorState refusal={classifyRefusal(refusal)} onRetry={() => run.mutate()} />
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog open: the refusal, if there is one, belongs here.
              event.preventDefault();
              setRefusal(undefined);
              run.mutate();
            }}
            disabled={run.isPending}
          >
            {run.isPending ? 'Retirando…' : 'Retirar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
