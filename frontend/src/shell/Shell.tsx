/**
 * T027/T028 — mounts `Header` and `NavigationMenu` around the content region (FR-001,
 * FR-006), and renders FR-007's no-active-tenant directive instead of an empty menu
 * when no tenant context is active. A Client Component: the tenant switch (US2)
 * needs to update the active tenant without a full page reload.
 */
'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from './Header';
import { NavigationMenu } from './NavigationMenu';
import type { NavigationItem } from './navigation-items';
import { writeActiveTenantClient, type ActiveTenant } from '../session/active-tenant';
import type { Principal } from '../session/types';

export interface ShellProps {
  readonly principal: Principal;
  readonly initialActiveTenant: ActiveTenant;
  readonly items: readonly NavigationItem[];
  readonly children: React.ReactNode;
}

/**
 * data-model.md's ActiveTenant state transition: 'none' -> 'active' happens once a
 * Principal resolves with at least one membership and either it holds exactly one
 * (auto-selected here) or the person picks one via TenantSwitcher. An identity with
 * more than one membership and no prior selection stays 'none' — FR-007's directive —
 * because auto-picking one of several would be exactly the wrong-tenant-that-looks-
 * correct failure Story 2's own priority rationale warns against.
 */
function resolveActiveTenant(raw: ActiveTenant, principal: Principal): ActiveTenant {
  if (raw.status === 'active') return raw;
  if (principal.memberships.length === 1) {
    return { status: 'active', tenantId: principal.memberships[0]!.tenantId };
  }
  return raw;
}

export function Shell({ principal, initialActiveTenant, items, children }: ShellProps): React.JSX.Element {
  const [rawActiveTenant, setRawActiveTenant] = useState<ActiveTenant>(initialActiveTenant);
  const queryClient = useQueryClient();

  const activeTenant = resolveActiveTenant(rawActiveTenant, principal);

  // Persist an auto-selection so a later SSR read (research.md D2) agrees with what
  // this render already shows — a plain cookie write, not a setState call, so this
  // does not trigger the cascading-render pattern useEffect's own state-set warning
  // exists to catch.
  useEffect(() => {
    if (activeTenant.status === 'active' && rawActiveTenant.status !== 'active') {
      writeActiveTenantClient(activeTenant.tenantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant]);

  const activeMembership =
    activeTenant.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === activeTenant.tenantId)
      : undefined;

  // research.md D2, contracts/feedback-states.md §5: writes the cookie (persistence
  // across reloads), updates local state (immediate re-render, no reload), and
  // invalidates every tenant-scoped query so the content region re-fetches under the
  // new x-tenant-id — the 'principal' query key is exempt, since it does not vary by
  // active tenant.
  function handleSwitchTenant(tenantId: string): void {
    writeActiveTenantClient(tenantId);
    setRawActiveTenant({ status: 'active', tenantId });
    void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'principal' });
  }

  if (activeTenant.status === 'none' || !activeMembership) {
    return (
      <div data-testid="no-active-tenant" className="flex flex-col items-center gap-2 p-8 text-center">
        <p>No tienes un contexto de tenant activo.</p>
        <p className="text-sm">Selecciona una firma para continuar.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        activeMembership={activeMembership}
        memberships={principal.memberships}
        onSwitchTenant={handleSwitchTenant}
      />
      <div className="flex flex-1">
        <NavigationMenu items={items} archetype={activeMembership.archetype} />
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
