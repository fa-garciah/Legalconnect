/**
 * 014 T017 (US1). "Usuarios e invitaciones": who is in the firm, who has been invited, and the
 * way to invite someone.
 *
 * The issued invitation — link included — lives in THIS component's state from the moment the
 * API returns it until the person closes the link modal, and nowhere else (Decision 3).
 */
'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { can } from '@/authz/can';
import type { IssuedInvitation } from '@/configuracion/types';
import type { Archetype } from '@/session/types';
import { InvitationLinkModal } from './InvitationLinkModal';
import { InviteUserDialog } from './InviteUserDialog';
import { PendingInvitationsTable } from './PendingInvitationsTable';
import { UserListTable } from './UserListTable';

export interface UsersTabProps {
  readonly archetype: Archetype;
}

export function UsersTab({ archetype }: UsersTabProps): React.JSX.Element {
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);
  const mayInvite = can('invitation.issue', archetype);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="miembros-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="miembros-heading" className="font-display text-heading font-semibold">
            Miembros del despacho
          </h2>
          {mayInvite ? (
            <Button onClick={() => setInviting(true)}>
              <UserPlus aria-hidden className="mr-2 h-4 w-4" />
              Invitar
            </Button>
          ) : null}
        </div>
        <UserListTable archetype={archetype} />
      </section>

      {can('invitation.read_pending', archetype) ? (
        <section aria-labelledby="invitaciones-heading" className="flex flex-col gap-3">
          <h2 id="invitaciones-heading" className="font-display text-heading font-semibold">
            Invitaciones pendientes
          </h2>
          <PendingInvitationsTable archetype={archetype} />
        </section>
      ) : null}

      {mayInvite ? (
        <InviteUserDialog
          open={inviting}
          issuerArchetype={archetype}
          onClose={() => setInviting(false)}
          onIssued={(invitation) => {
            setInviting(false);
            setIssued(invitation);
          }}
        />
      ) : null}

      <InvitationLinkModal invitation={issued} onClose={() => setIssued(null)} />
    </div>
  );
}
