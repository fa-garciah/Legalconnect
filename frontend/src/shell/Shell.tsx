/**
 * T027/T028 — mounts `Header` and `NavigationMenu` around the content region (FR-001,
 * FR-006), and renders FR-007's no-active-tenant directive instead of an empty menu
 * when no tenant context is active. A Client Component: the tenant switch (US2)
 * needs to update the active tenant without a full page reload.
 */
'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Header } from './Header';
import { FirmPicker } from './FirmPicker';
import { resolveActiveTenant } from './resolve-active-tenant';
import { signOutAction } from '../session/sign-out';
import { Sidebar } from './Sidebar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { NavigationItem } from './navigation-items';
import { writeActiveTenantClient, type ActiveTenant } from '../session/active-tenant';
import type { Principal } from '../session/types';

export interface ShellProps {
  readonly principal: Principal;
  readonly initialActiveTenant: ActiveTenant;
  readonly items: readonly NavigationItem[];
  readonly children: React.ReactNode;
}


export function Shell({ principal, initialActiveTenant, items, children }: ShellProps): React.JSX.Element {
  const [rawActiveTenant, setRawActiveTenant] = useState<ActiveTenant>(initialActiveTenant);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const activeTenant = resolveActiveTenant(rawActiveTenant, principal);

  // Persist an auto-selection so a later SSR read (research.md D2) agrees with what
  // this render already shows — a plain cookie write, not a setState call, so this
  // does not trigger the cascading-render pattern useEffect's own state-set warning
  // exists to catch.
  useEffect(() => {
    // Also when the resolved firm CORRECTS a stale cookie, not only when there was none —
    // otherwise the stale id is re-read on every load and corrected on every render.
    if (
      activeTenant.status === 'active' &&
      (rawActiveTenant.status !== 'active' || rawActiveTenant.tenantId !== activeTenant.tenantId)
    ) {
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
    /*
     * The page under the shell is a SERVER component that resolved the firm — and with it
     * the caller's role — when it rendered. Invalidating the client's queries refreshed the
     * data but not that: after the firm picker the page stayed EMPTY, and after a switch it
     * kept drawing the PREVIOUS firm's role (Socio controls for somebody who is an Asociado
     * in the firm they had just switched to). Found in the browser, 2026-09-22. The cookie is
     * already written above, so the re-render resolves the right firm.
     */
    router.refresh();
  }

  /*
   * TWO DIFFERENT STATES, AND THEY USED TO SHARE ONE SCREEN.
   *
   * This branch rendered a bare centred message for every case where no membership was
   * active — including an EXPIRED SESSION, which is now redirected in the root layout and
   * never reaches here. What remains are two genuine states, and they are not the same
   * thing:
   *
   *   - the identity belongs to NO firm (002/FR-011 — a valid, lasting state), and
   *   - it belongs to several and has not picked one yet (`016a`/FR-007's directive).
   *
   * Neither is an error, and neither should strand anybody: both now render a sign-out
   * control, because a screen a person cannot act on and cannot leave is the worst state
   * the shell can put them in.
   */
  if (activeTenant.status === 'none' || !activeMembership) {
    const belongsToNothing = principal.memberships.length === 0;

    // Several firms, none chosen: a real decision, so it gets a real screen.
    if (!belongsToNothing) {
      return <FirmPicker memberships={principal.memberships} onChoose={handleSwitchTenant} />;
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-secondary/40 p-8 text-center">
        <div data-testid="no-active-tenant" className="max-w-md space-y-2">
          <h1 className="font-display text-heading font-semibold">
            Tu cuenta no pertenece a ninguna firma
          </h1>
          <p className="text-sm text-muted-foreground">
            Pide a un administrador de tu despacho que te envíe una invitación. Al aceptarla,
            la firma aparecerá aquí.
          </p>
        </div>

        {/* FR-008's own reason, applied to the one screen that used to omit it: a person
            must always be able to leave, especially on a screen they cannot otherwise act
            on. */}
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    );
  }

  // The person the rail names. Until `003` ships authentication there is no account to
  // read a name from, so the active firm's own name stands in — which is at least true.
  const displayName = activeMembership.tenantName;

  return (
    <div className="min-h-screen bg-secondary/40">
      {/*
       * The rail. Fixed and always present from `lg` up; below that it is the drawer
       * further down, opened from the header's menu button.
       */}
      <div className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r lg:block">
        <Sidebar items={items} activeMembership={activeMembership} displayName={displayName} />
      </div>

      <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          {/* Radix requires an accessible name on a dialog; the rail's own brand is visual. */}
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <Sidebar
            items={items}
            activeMembership={activeMembership}
            displayName={displayName}
            navTestId="shell-nav-mobile"
            onNavigate={() => setNavigationOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen flex-col lg:pl-72">
        <Header
          activeMembership={activeMembership}
          memberships={principal.memberships}
          onSwitchTenant={handleSwitchTenant}
          onOpenNavigation={() => setNavigationOpen(true)}
        />
        {/*
         * `min-w-0` added by 018/T055, and it is load-bearing rather than defensive.
         *
         * A flex item defaults to `min-width: auto`, which refuses to shrink below its
         * content's minimum. `016a` ships no business screen, so this region never held
         * anything wide and the default was invisible. `018` puts a wide client grid here.
         * Content that is meant to scroll inside its own container stretches this element
         * instead, and the PAGE scrolls sideways — dragging the header and the navigation
         * off screen with no obvious way back (measured at the mobile viewport: 772px of
         * content in a 412px window).
         *
         * `tests/e2e/responsive.spec.ts` covers it at both viewports.
         */}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
