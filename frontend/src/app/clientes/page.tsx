/**
 * T027, T035 — the `/clientes` route.
 *
 * Thin on purpose. `016a`'s root layout already mounts the shell — header, navigation,
 * tenant context — around every route, so this page contributes the content region and
 * nothing else. A page that built its own chrome would be the second top-level navigation
 * `016a/FR-001` exists to prevent.
 *
 * The one thing it does resolve is the active membership's archetype, which the directory
 * needs to decide which controls are worth drawing. Read here, server-side, from the same
 * seam the layout uses — rather than fetched again in the browser, which would be a second
 * answer to a question that has one.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { ClientDirectory } from './ClientDirectory';

export const metadata: Metadata = {
  title: 'Clientes · LegalConnect MX',
};

export default async function ClientesPage(): Promise<React.JSX.Element> {
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);

  /*
   * The SAME resolution the shell performs, not a second copy of it. This page used to
   * re-derive the active firm on its own and had the stale-cookie defect the shell's copy
   * had: a remembered tenant id from an old seed or a revoked membership found no match here
   * and rendered nothing. One function, so the page and the shell cannot disagree.
   */
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === resolved.tenantId)
      : undefined;

  if (!membership) {
    /*
     * The shell renders `016a`/FR-007's directive above this in the same situation, so
     * reaching here means the layout has already said what to do. Rendering nothing is
     * correct; rendering a directory with no archetype would draw a screen whose every
     * control is hidden for a reason nobody stated.
     */
    return <></>;
  }

  return <ClientDirectory archetype={membership.archetype} />;
}
