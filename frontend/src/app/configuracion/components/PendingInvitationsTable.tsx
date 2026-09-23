/**
 * 014 T016 (US1). The firm's pending invitations, and revoking one.
 *
 * Each row names whom it is for (`invitedEmail`, FR-028), the role, and when it was issued and
 * expires. There is no "resend": the raw link is never stored, so the path for a lost link is
 * revoke and issue again (contracts §4).
 */
'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import { can } from '@/authz/can';
import type { FailedResponse } from '@/lib/api-client';
import { ARCHETYPE_LABEL } from '@/shell/archetype-labels';
import { listPendingInvitations, revokeInvitation } from '@/configuracion/api';
import { formatDate } from '@/configuracion/format';
import type { PendingInvitation } from '@/configuracion/types';
import type { Archetype } from '@/session/types';
import { GatedConfirmDialog } from './GatedConfirmDialog';

export interface PendingInvitationsTableProps {
  readonly archetype: Archetype;
}

export function PendingInvitationsTable({ archetype }: PendingInvitationsTableProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<PendingInvitation | null>(null);
  const mayRevoke = can('invitation.revoke', archetype);

  const query = useQuery<readonly PendingInvitation[], FailedResponse | null>({
    queryKey: ['invitations'],
    queryFn: listPendingInvitations,
  });

  return (
    <>
      <QueryBoundary
        query={query}
        isEmpty={(items) => items.length === 0}
        emptyGuidance="No hay invitaciones pendientes."
      >
        {(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Enviada</TableHead>
                <TableHead>Vence</TableHead>
                {mayRevoke ? <TableHead className="sr-only">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium">{invitation.invitedEmail}</TableCell>
                  <TableCell>{ARCHETYPE_LABEL[invitation.targetArchetype]}</TableCell>
                  <TableCell>{formatDate(invitation.issuedAt)}</TableCell>
                  <TableCell>{formatDate(invitation.expiresAt)}</TableCell>
                  {mayRevoke ? (
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Revocar la invitación de ${invitation.invitedEmail}`}
                        onClick={() => setTarget(invitation)}
                      >
                        Revocar
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryBoundary>

      {target ? (
        <GatedConfirmDialog
          key={target.id}
          open
          capability="invitation.revoke"
          title="¿Revocar invitación?"
          description={
            <>
              El enlace enviado a <strong>{target.invitedEmail}</strong> dejará de funcionar. Si la
              persona aún debe unirse, tendrás que crear una invitación nueva.
            </>
          }
          confirmLabel="Revocar invitación"
          pendingLabel="Revocando…"
          run={(token) => revokeInvitation(target.id, token)}
          onDone={() => void queryClient.invalidateQueries({ queryKey: ['invitations'] })}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}
