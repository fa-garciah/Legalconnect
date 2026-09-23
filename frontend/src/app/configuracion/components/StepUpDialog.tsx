/**
 * 014 T009f (FR-026). The prompt for a fresh second factor before a gated action.
 *
 * It does the `005` exchange and hands the token to the caller; it never sends the gated
 * request itself. That keeps one dialog for all four gated actions on `/configuracion`, and it
 * keeps the token's life to exactly one caller's one request.
 *
 * A refused code clears the field and shows one sentence. Which check failed is not said,
 * because the API does not say either (005/FR-020).
 */
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { isSixDigitCode, requestStepUp, type StepUpCapability } from '@/configuracion/step-up';

export interface StepUpDialogProps {
  readonly open: boolean;
  readonly capability: StepUpCapability;
  readonly onVerified: (token: string) => void;
  readonly onCancel: () => void;
}

const FAILURE_COPY = {
  refused: 'No fue posible verificar el código. Revisa tu aplicación e inténtalo de nuevo.',
  unreachable: 'No fue posible conectar con el servidor. Inténtalo de nuevo.',
} as const;

export function StepUpDialog({
  open,
  capability,
  onVerified,
  onCancel,
}: StepUpDialogProps): React.JSX.Element {
  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<keyof typeof FAILURE_COPY | null>(null);
  const [pending, setPending] = useState(false);
  const anchor = useDialogAnchor(open);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSixDigitCode(code) || pending) return;
    setPending(true);
    setFailure(null);
    const outcome = await requestStepUp(capability, code);
    setPending(false);
    if (outcome.ok) {
      setCode('');
      onVerified(outcome.token);
      return;
    }
    setCode('');
    setFailure(outcome.reason);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent {...anchor}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Verificación adicional</DialogTitle>
            <DialogDescription>
              Esta acción requiere confirmar tu identidad. Escribe el código que muestra tu
              aplicación de autenticación.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-2">
            <Label htmlFor="step-up-code">Código de seis dígitos</Label>
            <Input
              id="step-up-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={failure !== null}
              aria-describedby={failure ? 'step-up-failure' : undefined}
              autoFocus
            />
            {failure ? (
              <p id="step-up-failure" role="alert" className="text-small text-destructive">
                {FAILURE_COPY[failure]}
              </p>
            ) : null}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!isSixDigitCode(code) || pending}>
              {pending ? 'Verificando…' : 'Verificar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
