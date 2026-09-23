/**
 * 014 T016 (US1). Inviting a person to the firm.
 *
 * Order: the form validates, the second factor is asked for (`invitation.issue` is step-up
 * gated, 005), and only then is the invitation sent. The form hides while the code is asked for
 * rather than stacking two modal dialogs, and returns with the pending state or the refusal.
 *
 * The role list is `offerableArchetypes(issuer)`: an MP is never offered SA (002/FR-021). The
 * server refuses regardless.
 *
 * On success the caller receives the issued invitation, link included, and shows it once in
 * `InvitationLinkModal`. This component keeps no copy.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { issueInvitation } from '@/configuracion/api';
import { inviteFormSchema, offerableArchetypes, type InviteFormValues } from '@/configuracion/schema';
import type { IssuedInvitation } from '@/configuracion/types';
import type { Archetype } from '@/session/types';
import { RoleSelect } from './RoleSelect';
import { StepUpDialog } from './StepUpDialog';

export interface InviteUserDialogProps {
  readonly open: boolean;
  readonly issuerArchetype: Archetype;
  readonly onClose: () => void;
  readonly onIssued: (invitation: IssuedInvitation) => void;
}

type FieldErrors = Partial<Record<keyof InviteFormValues, string>>;

export function InviteUserDialog({
  open,
  issuerArchetype,
  onClose,
  onIssued,
}: InviteUserDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Archetype | ''>('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [ready, setReady] = useState<InviteFormValues | null>(null);
  const [askingCode, setAskingCode] = useState(false);
  const [refusal, setRefusal] = useState<FailedResponse | null | undefined>(undefined);
  const anchor = useDialogAnchor(open && !askingCode);

  const send = useMutation<IssuedInvitation, FailedResponse | null, { values: InviteFormValues; token: string }>({
    mutationFn: ({ values, token }) => issueInvitation(values, token),
    onSuccess: (issued) => {
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setEmail('');
      setRole('');
      setReady(null);
      onIssued(issued);
    },
    onError: (failed) => setRefusal(failed),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = inviteFormSchema.safeParse({ email, targetArchetype: role || undefined });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof InviteFormValues;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setRefusal(undefined);
    setReady(parsed.data);
    setAskingCode(true);
  }

  function close() {
    setErrors({});
    setRefusal(undefined);
    setAskingCode(false);
    onClose();
  }

  return (
    <>
      <Dialog open={open && !askingCode} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent {...anchor}>
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Invitar a una persona</DialogTitle>
              <DialogDescription>
                Recibirás un enlace para enviarle. Al abrirlo, la persona crea su contraseña y se
                une a tu despacho con el rol que elijas.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="invite-email">Correo electrónico</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'invite-email-error' : undefined}
                />
                {errors.email ? (
                  <p id="invite-email-error" role="alert" className="text-sm text-destructive">
                    {errors.email}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="invite-role">Rol en el despacho</Label>
                <RoleSelect
                  id="invite-role"
                  value={role}
                  options={offerableArchetypes(issuerArchetype)}
                  onChange={setRole}
                  invalid={Boolean(errors.targetArchetype)}
                  describedBy={errors.targetArchetype ? 'invite-role-error' : undefined}
                />
                {errors.targetArchetype ? (
                  <p id="invite-role-error" role="alert" className="text-sm text-destructive">
                    {errors.targetArchetype}
                  </p>
                ) : null}
              </div>

              {refusal !== undefined ? (
                <ErrorState refusal={classifyRefusal(refusal)} onRetry={() => setAskingCode(true)} />
              ) : null}
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={send.isPending}>
                {send.isPending ? 'Enviando…' : 'Enviar invitación'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <StepUpDialog
        open={open && askingCode}
        capability="invitation.issue"
        onVerified={(token) => {
          setAskingCode(false);
          if (ready) send.mutate({ values: ready, token });
        }}
        onCancel={() => setAskingCode(false)}
      />
    </>
  );
}
