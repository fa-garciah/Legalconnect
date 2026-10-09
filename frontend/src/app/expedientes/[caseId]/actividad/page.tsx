/**
 * 008 — `/expedientes/{caseId}/actividad`. Thin, like `/documentos` and `/notas`.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { ActivityView } from './ActivityView';

export const metadata: Metadata = {
  title: 'Actividad · LegalConnect MX',
};

export default async function ActividadPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}): Promise<React.JSX.Element> {
  const [{ caseId }, principal, activeTenant] = await Promise.all([params, getPrincipal(), readActiveTenantServer()]);
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active' ? principal.memberships.find((m) => m.tenantId === resolved.tenantId) : undefined;

  if (!membership) return <></>;
  return <ActivityView caseId={caseId} archetype={membership.archetype} />;
}
