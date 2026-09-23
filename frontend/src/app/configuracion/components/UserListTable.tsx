/**
 * 014 T016 (US1). The firm's members, and deactivating one.
 *
 * The list comes from `GET /tenant/members` with each person's email (Decision 5). If that is
 * refused or fails, `listMembers` falls back to the directory and this table says plainly that
 * the email is unavailable — never a UUID in its place (contracts §1.2).
 *
 * The firm's last `SA` is offered no "Desactivar" (FR-012). The server keeps its own rule and is
 * authoritative; this only avoids drawing a control whose one outcome is a refusal.
 *
 * `renderActions` lets the "Cargos y roles" tab reuse this list with its own controls.
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
import { listMembers, revokeMembership } from '@/configuracion/api';
import type { Member, MemberList } from '@/configuracion/types';
import type { Archetype } from '@/session/types';
import { GatedConfirmDialog } from './GatedConfirmDialog';

const NO_EMAIL = 'Correo no disponible';

/** Whether `member` is the only live SA — the one FR-012 protects. */
export function isLastSystemAdministrator(member: Member, all: readonly Member[]): boolean {
  return member.archetype === 'SA' && all.filter((m) => m.archetype === 'SA').length === 1;
}

/** How a member is named in copy: email when there is one, otherwise role and position. */
export function describeMember(member: Member): string {
  if (member.email) return member.email;
  const role = ARCHETYPE_LABEL[member.archetype];
  return member.positionName ? `${role} (${member.positionName})` : role;
}

export interface UserListTableProps {
  readonly archetype: Archetype;
  /** Replaces the default "Desactivar" column. */
  readonly renderActions?: (member: Member, all: readonly Member[]) => React.ReactNode;
}

export function UserListTable({ archetype, renderActions }: UserListTableProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<Member | null>(null);
  const mayRevoke = can('membership.revoke', archetype);
  const showActions = Boolean(renderActions) || mayRevoke;

  const query = useQuery<MemberList, FailedResponse | null>({
    queryKey: ['members'],
    queryFn: listMembers,
  });

  return (
    <>
      <QueryBoundary
        query={query}
        isEmpty={(list) => list.items.length === 0}
        emptyGuidance="Este despacho aún no tiene miembros activos."
      >
        {(list) => (
          <>
            {!list.withEmail ? (
              <p role="note" className="mb-2 text-sm text-muted-foreground">
                {NO_EMAIL}: se muestran el rol y el cargo de cada persona.
              </p>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Cargo</TableHead>
                  {showActions ? <TableHead className="sr-only">Acciones</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((member) => (
                  <TableRow key={member.membershipId}>
                    <TableCell className="font-medium">
                      {member.email ?? <span className="text-muted-foreground">{NO_EMAIL}</span>}
                    </TableCell>
                    <TableCell>{ARCHETYPE_LABEL[member.archetype]}</TableCell>
                    <TableCell>{member.positionName ?? '—'}</TableCell>
                    {showActions ? (
                      <TableCell className="text-right">
                        {renderActions
                          ? renderActions(member, list.items)
                          : mayRevoke && !isLastSystemAdministrator(member, list.items) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Desactivar a ${describeMember(member)}`}
                                onClick={() => setTarget(member)}
                              >
                                Desactivar
                              </Button>
                            ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </QueryBoundary>

      {target ? (
        <GatedConfirmDialog
          key={target.membershipId}
          open
          capability="membership.revoke"
          title="¿Desactivar acceso?"
          description={
            <>
              <strong>{describeMember(target)}</strong> dejará de poder entrar a este despacho y
              saldrá de los expedientes que tenga asignados. Su historial se conserva.
            </>
          }
          confirmLabel="Desactivar acceso"
          pendingLabel="Desactivando…"
          run={(token) => revokeMembership(target.membershipId, token)}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['members'] });
            void queryClient.invalidateQueries({ queryKey: ['directory'] });
          }}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}
