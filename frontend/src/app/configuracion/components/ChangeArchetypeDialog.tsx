/**
 * 014 T023 (US2). Changing a member's role — `membership.change_archetype`, SA only, step-up
 * gated (005).
 *
 * An MP sees each member's role but gets no control to change it: this is the one capability on
 * `/configuracion` that the matrix gives to SA alone. The firm's last SA gets the control
 * disabled, with the reason, because demoting them would leave nobody able to administer the
 * firm (FR-012). The server refuses both cases on its own.
 */
'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { can } from '@/authz/can';
import { changeArchetype } from '@/configuracion/api';
import type { Member } from '@/configuracion/types';
import { ARCHETYPE_LABEL } from '@/shell/archetype-labels';
import type { Archetype } from '@/session/types';
import { GatedConfirmDialog } from './GatedConfirmDialog';
import { RoleSelect } from './RoleSelect';
import { describeMember, isLastSystemAdministrator } from './UserListTable';

const INTERNAL: readonly Archetype[] = ['SA', 'MP', 'AA', 'PL', 'CM', 'BM'];

export interface ChangeArchetypeControlProps {
  /** The caller's own archetype — decides whether the control is drawn. */
  readonly archetype: Archetype;
  readonly member: Member;
  readonly all: readonly Member[];
}

export function ChangeArchetypeControl({ archetype, member, all }: ChangeArchetypeControlProps): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<Archetype | ''>('');

  if (!can('membership.change_archetype', archetype)) return null;
  const lastSa = isLastSystemAdministrator(member, all);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={lastSa}
        title={lastSa ? 'El despacho necesita al menos un administrador.' : undefined}
        aria-label={`Cambiar rol de ${describeMember(member)}`}
        onClick={() => {
          setNext('');
          setOpen(true);
        }}
      >
        Cambiar rol
      </Button>

      {open ? (
        <GatedConfirmDialog
          open
          capability="membership.change_archetype"
          title="Cambiar rol"
          description={
            <>
              <strong>{describeMember(member)}</strong> tiene hoy el rol{' '}
              {ARCHETYPE_LABEL[member.archetype]}. El cambio aplica desde su siguiente acción.
            </>
          }
          confirmLabel="Cambiar rol"
          pendingLabel="Cambiando…"
          canConfirm={next !== ''}
          run={(token) => changeArchetype(member.membershipId, next as Archetype, token)}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['members'] });
            void queryClient.invalidateQueries({ queryKey: ['directory'] });
          }}
          onClose={() => setOpen(false)}
        >
          <div className="grid gap-2">
            <Label htmlFor={`new-role-${member.membershipId}`}>Nuevo rol</Label>
            <RoleSelect
              id={`new-role-${member.membershipId}`}
              value={next}
              options={INTERNAL.filter((a) => a !== member.archetype)}
              onChange={setNext}
            />
          </div>
        </GatedConfirmDialog>
      ) : null}
    </>
  );
}
