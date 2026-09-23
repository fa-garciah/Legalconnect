/**
 * 014 T023 (US2). Giving a member a position from the firm's catalog (017,
 * `directory.assign_position`). Not step-up gated: a position is a label, not a permission.
 *
 * Only ACTIVE positions are offered — `017` refuses assigning a retired one. "Sin cargo" clears
 * the assignment.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { can } from '@/authz/can';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { assignPosition, listPositions } from '@/configuracion/api';
import type { Member, Position } from '@/configuracion/types';
import type { Archetype } from '@/session/types';
import { describeMember } from './UserListTable';

export interface AssignPositionControlProps {
  readonly archetype: Archetype;
  readonly member: Member;
}

export function AssignPositionControl({ archetype, member }: AssignPositionControlProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!can('directory.assign_position', archetype)) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Asignar cargo a ${describeMember(member)}`}
        onClick={() => setOpen(true)}
      >
        Asignar cargo
      </Button>
      {open ? <AssignPositionDialog member={member} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AssignPositionDialog({ member, onClose }: { member: Member; onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const positions = useQuery<readonly Position[], FailedResponse | null>({
    queryKey: ['positions'],
    queryFn: listPositions,
  });
  const active = (positions.data ?? []).filter((p) => p.status === 'active');
  const current = active.find((p) => p.name === member.positionName)?.id ?? '';
  const [chosen, setChosen] = useState<string | null>(null);
  const value = chosen ?? current;

  const save = useMutation<void, FailedResponse | null, string>({
    mutationFn: (positionId) => assignPosition(member.membershipId, positionId || null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void queryClient.invalidateQueries({ queryKey: ['directory'] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent {...anchor}>
        <DialogHeader>
          <DialogTitle>Asignar cargo</DialogTitle>
          <DialogDescription>{describeMember(member)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={`position-${member.membershipId}`}>Cargo</Label>
          <select
            id={`position-${member.membershipId}`}
            value={value}
            onChange={(e) => setChosen(e.target.value)}
            disabled={positions.status !== 'success'}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
          >
            <option value="">Sin cargo</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {positions.status === 'error' ? (
          <ErrorState refusal={classifyRefusal(positions.error)} onRetry={() => void positions.refetch()} />
        ) : null}
        {save.status === 'error' ? (
          <ErrorState refusal={classifyRefusal(save.error)} onRetry={() => save.mutate(value)} />
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={save.isPending || positions.status !== 'success'}
            onClick={() => save.mutate(value)}
          >
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
