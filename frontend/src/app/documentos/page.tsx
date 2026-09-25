/**
 * 023 — the `/documentos` route.
 *
 * Thin on purpose, exactly as `/clientes` and `/expedientes` are: `016a`'s root layout mounts
 * the shell around every route, so this page contributes the content region and nothing else.
 *
 * The one thing it resolves is the active membership's archetype, which the screen needs in
 * order to decide which controls are worth drawing — read here, server-side, from the same
 * seam the shell uses rather than fetched again in the browser, which would be a second answer
 * to a question that has one.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { FirmDocuments } from './FirmDocuments';

export const metadata: Metadata = {
  title: 'Documentos · LegalConnect MX',
};

export default async function DocumentosPage(): Promise<React.JSX.Element> {
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);

  // The SAME resolution the shell performs, never a second copy: a remembered tenant id from
  // an old seed or a revoked membership must resolve identically in both places.
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === resolved.tenantId)
      : undefined;

  if (!membership) {
    // The shell has already rendered `016a`/FR-007's directive above this. Rendering a screen
    // with no archetype would hide every control for a reason nobody stated.
    return <></>;
  }

  return <FirmDocuments archetype={membership.archetype} />;
}
