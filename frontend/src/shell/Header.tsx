/**
 * T026 / T033 — FR-001, FR-006, FR-008 to FR-010. Names the active tenant at all
 * times a tenant context is active; mounts `TenantSwitcher` only when the identity
 * holds more than one live membership (`TenantSwitcher` itself is the FR-010 check).
 */
import { TenantSwitcher } from './TenantSwitcher';
import type { ActiveMembership } from '../session/types';

export interface HeaderProps {
  readonly activeMembership: ActiveMembership;
  readonly memberships: readonly ActiveMembership[];
  readonly onSwitchTenant: (tenantId: string) => void;
}

export function Header({ activeMembership, memberships, onSwitchTenant }: HeaderProps): React.JSX.Element {
  return (
    <header data-testid="shell-header" className="flex items-center justify-between border-b p-4">
      <span className="font-semibold">LegalConnect MX</span>
      <div className="flex items-center gap-3">
        <span data-testid="active-tenant-name">{activeMembership.tenantName}</span>
        <TenantSwitcher
          memberships={memberships}
          activeTenantId={activeMembership.tenantId}
          onSwitch={onSwitchTenant}
        />
      </div>
    </header>
  );
}
