/**
 * 014. Confirm, then second factor, then the request — the one order every irreversible,
 * step-up-gated action on `/configuracion` follows (revoke an invitation, deactivate a member,
 * change a role).
 *
 * One component so the four cannot drift: a copy that asked for the code BEFORE confirming
 * would spend a single-use, two-minute token on a person who then pressed "Cancelar", and a
 * copy that skipped the confirmation would make an irreversible change one click away.
 *
 * The token is passed straight to `run` and not kept. A refusal reopens the confirmation with
 * `016a`'s classified copy, so a retry is a fresh confirmation and a fresh code.
 */
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
import type { StepUpCapability } from '@/configuracion/step-up';
import { StepUpDialog } from './StepUpDialog';

export interface GatedConfirmDialogProps {
  readonly open: boolean;
  readonly capability: StepUpCapability;
  readonly title: string;
  readonly description: React.ReactNode;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  /** Sends the gated request with the token. Rejects with `FailedResponse | null`. */
  readonly run: (stepUpToken: string) => Promise<unknown>;
  readonly onDone: () => void;
  readonly onClose: () => void;
  /** Optional content between the description and the buttons (e.g. a role selector). */
  readonly children?: React.ReactNode;
  /** When false the confirm button is disabled — the caller's own input is incomplete. */
  readonly canConfirm?: boolean;
}

type Stage = 'confirm' | 'step-up';

export function GatedConfirmDialog({
  open,
  capability,
  title,
  description,
  confirmLabel,
  pendingLabel,
  run,
  onDone,
  onClose,
  children,
  canConfirm = true,
}: GatedConfirmDialogProps): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('confirm');
  const [refusal, setRefusal] = useState<FailedResponse | null | undefined>(undefined);
  const anchor = useDialogAnchor(open && stage === 'confirm');

  const mutation = useMutation<unknown, FailedResponse | null, string>({
    mutationFn: (token) => run(token),
    onSuccess: () => {
      setStage('confirm');
      setRefusal(undefined);
      onDone();
      onClose();
    },
    onError: (failed) => {
      setStage('confirm');
      setRefusal(failed);
    },
  });

  function close() {
    setStage('confirm');
    setRefusal(undefined);
    onClose();
  }

  return (
    <>
      <AlertDialog
        open={open && stage === 'confirm'}
        onOpenChange={(next) => (next ? undefined : close())}
      >
        <AlertDialogContent {...anchor}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>

          {children}

          {refusal !== undefined ? (
            <ErrorState
              refusal={classifyRefusal(refusal)}
              onRetry={() => {
                setRefusal(undefined);
                setStage('step-up');
              }}
            />
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={close}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirm || mutation.isPending}
              onClick={(event) => {
                // Keep the flow here: the next step is the second factor, not closing.
                event.preventDefault();
                setRefusal(undefined);
                setStage('step-up');
              }}
            >
              {mutation.isPending ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StepUpDialog
        open={open && stage === 'step-up'}
        capability={capability}
        onVerified={(token) => {
          // Back to the confirmation, which shows the pending label while the request runs.
          setStage('confirm');
          mutation.mutate(token);
        }}
        onCancel={() => setStage('confirm')}
      />
    </>
  );
}
