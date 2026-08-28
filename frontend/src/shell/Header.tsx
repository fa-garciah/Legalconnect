/**
 * T026 / T033 (016a) — FR-001, FR-006, FR-008 to FR-010. Names the active tenant at all
 * times a tenant context is active; mounts `TenantSwitcher` only when the identity holds
 * more than one live membership (`TenantSwitcher` itself is the FR-010 check).
 *
 * Restyled as the product's top bar, and the brand moved out of it into the left rail.
 * What stayed is the part `016a` requires: the active firm is named here, always, and the
 * switch sits next to its name. On a screen that reads and writes one firm's records, "which
 * firm am I in" must be answerable without scrolling or clicking.
 */
'use client';

import { Menu } from 'lucide-react';
import { TenantSwitcher } from './TenantSwitcher';
import type { ActiveMembership } from '../session/types';

export interface HeaderProps {
  readonly activeMembership: ActiveMembership;
  readonly memberships: readonly ActiveMembership[];
  readonly onSwitchTenant: (tenantId: string) => void;
  /** Opens the navigation drawer. Absent on the desktop layout, where the rail is always visible. */
  readonly onOpenNavigation?: () => void;
}

export function Header({
  activeMembership,
  memberships,
  onSwitchTenant,
  onOpenNavigation,
}: HeaderProps): React.JSX.Element {
  return (
    <header
      data-testid="shell-header"
      className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6"
    >
      {onOpenNavigation ? (
        <button
          type="button"
          onClick={onOpenNavigation}
          className="rounded-md p-2 text-muted-foreground hover:bg-secondary lg:hidden"
        >
          <Menu aria-hidden className="h-5 w-5" />
          <span className="sr-only">Abrir navegación</span>
        </button>
      ) : null}

      <div className="ml-auto flex min-w-0 items-center gap-3">
        <span data-testid="active-tenant-name" className="truncate text-sm font-medium">
          {activeMembership.tenantName}
        </span>
        <TenantSwitcher
          memberships={memberships}
          activeTenantId={activeMembership.tenantId}
          onSwitch={onSwitchTenant}
        />
      </div>
    </header>
  );
}
