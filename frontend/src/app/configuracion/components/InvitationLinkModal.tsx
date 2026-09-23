/**
 * 014 T016 (US1, Decision 3). The invitation link, shown once.
 *
 * The API returns the raw token in the issue response only and keeps just its hash, so this is
 * the single moment the link exists outside the invitee's hands. Therefore:
 *
 *   - it is held in the CALLER's state and passed in; closing hands it back (`onClose`) and the
 *     caller drops it — this component keeps no copy;
 *   - it is never written to localStorage, sessionStorage or a cookie (the `003/FR-051` rule);
 *   - the warning says, in Spanish, that it will not be shown again, and how to send it.
 *
 * The API returns a relative path; the origin is this page's, because the API does not know
 * which host serves the frontend.
 */
'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
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
import { ARCHETYPE_LABEL } from '@/shell/archetype-labels';
import { formatDate } from '@/configuracion/format';
import type { IssuedInvitation } from '@/configuracion/types';

export interface InvitationLinkModalProps {
  readonly invitation: IssuedInvitation | null;
  readonly onClose: () => void;
}

export function InvitationLinkModal({ invitation, onClose }: InvitationLinkModalProps): React.JSX.Element | null {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const anchor = useDialogAnchor(invitation !== null);

  if (!invitation) return null;
  const link = `${window.location.origin}${invitation.invitationLink}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      // Clipboard permission refused: the field is selectable, so say how to copy by hand.
      setCopyFailed(true);
    }
  }

  function close() {
    setCopied(false);
    setCopyFailed(false);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent {...anchor}>
        <DialogHeader>
          <DialogTitle>Invitación creada</DialogTitle>
          <DialogDescription>
            Rol: {ARCHETYPE_LABEL[invitation.targetArchetype]}. Vence el{' '}
            {formatDate(invitation.expiresAt)}.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-2">
          <Label htmlFor="invitation-link">Enlace de invitación</Label>
          <div className="flex gap-2">
            <Input
              id="invitation-link"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-sm"
            />
            <Button type="button" onClick={copy} className="shrink-0">
              {copied ? <Check aria-hidden className="mr-2 h-4 w-4" /> : <Copy aria-hidden className="mr-2 h-4 w-4" />}
              Copiar enlace
            </Button>
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {copied ? 'Enlace copiado.' : copyFailed ? 'No se pudo copiar. Selecciona el enlace y cópialo manualmente.' : ''}
          </p>
        </div>

        <div role="note" className="rounded-md border border-accent bg-accent/10 p-3 text-sm">
          El enlace solo se muestra una vez. Cópialo y envíalo por un canal seguro. Si se pierde,
          revoca esta invitación y crea una nueva.
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
