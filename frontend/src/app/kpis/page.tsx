/**
 * 015 — the `/kpis` route.
 *
 * Thin, as `/clientes`, `/expedientes` and `/documentos` are: `016a`'s layout mounts the shell,
 * and this contributes the content region.
 *
 * It resolves the active membership only to confirm one exists. Unlike the other screens it does
 * NOT pass the archetype down, because `kpi.read` is held by `MP`, `CM` and `SA` and refused to
 * everyone else — there is no partial view of this page to draw. A caller who reaches it without
 * the capability is refused by the endpoint and sees `016a`'s classified error state, which is
 * the same answer the navigation already gave by not showing the item.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { KpiDashboard } from './KpiDashboard';

export const metadata: Metadata = {
  title: 'Indicadores · LegalConnect MX',
};

export default async function KpisPage(): Promise<React.JSX.Element> {
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);

  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === resolved.tenantId)
      : undefined;

  if (!membership) return <></>;

  return <KpiDashboard />;
}
