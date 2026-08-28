/**
 * T029 — the `/expedientes` route.
 *
 * Thin on purpose. `016a`'s root layout already mounts the shell — rail, header, tenant
 * context — around every route, so this page contributes the content region and nothing
 * else.
 *
 * The one thing it resolves is the active membership's archetype, which the register needs
 * for two decisions: which controls are worth drawing, and which of the two no-filter empty
 * states is true. Read here, server-side, from the same seam the layout uses — rather than
 * fetched again in the browser, which would be a second answer to a question that has one.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { CaseRegister } from './CaseRegister';

export const metadata: Metadata = {
  title: 'Expedientes · LegalConnect MX',
};

export default async function ExpedientesPage(): Promise<React.JSX.Element> {
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);

  const membership =
    activeTenant.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === activeTenant.tenantId)
      : principal.memberships.length === 1
        ? principal.memberships[0]
        : undefined;

  if (!membership) {
    /*
     * The shell renders `016a`/FR-007's directive above this in the same situation, so
     * reaching here means the layout has already said what to do. Rendering nothing is
     * correct; rendering a register with no archetype would draw a screen whose every
     * control is hidden for a reason nobody stated.
     */
    return <></>;
  }

  return <CaseRegister archetype={membership.archetype} />;
}
