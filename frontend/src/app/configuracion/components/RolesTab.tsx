/**
 * 014 T023 (US2). "Cargos y roles": the firm's position catalog, and each member's position and
 * role. The member list is `UserListTable` with this tab's controls in place of "Desactivar".
 */
'use client';

import type { Archetype } from '@/session/types';
import { AssignPositionControl } from './AssignPositionDialog';
import { ChangeArchetypeControl } from './ChangeArchetypeDialog';
import { PositionCatalogTable } from './PositionCatalogTable';
import { UserListTable } from './UserListTable';

export interface RolesTabProps {
  readonly archetype: Archetype;
}

export function RolesTab({ archetype }: RolesTabProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="cargos-heading" className="flex flex-col gap-3">
        <h2 id="cargos-heading" className="font-display text-heading font-semibold">
          Catálogo de cargos
        </h2>
        <PositionCatalogTable archetype={archetype} />
      </section>

      <section aria-labelledby="asignaciones-heading" className="flex flex-col gap-3">
        <h2 id="asignaciones-heading" className="font-display text-heading font-semibold">
          Cargo y rol de cada persona
        </h2>
        <UserListTable
          archetype={archetype}
          renderActions={(member, all) => (
            <div className="flex justify-end gap-2">
              <AssignPositionControl archetype={archetype} member={member} />
              <ChangeArchetypeControl archetype={archetype} member={member} all={all} />
            </div>
          )}
        />
      </section>
    </div>
  );
}
