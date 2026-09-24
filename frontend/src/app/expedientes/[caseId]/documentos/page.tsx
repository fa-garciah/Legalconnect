/**
 * 021 (Decision 1) — `/expedientes/{caseId}/documentos`.
 *
 * Thin, like `/clientes`: resolves the active membership's archetype through the same
 * `resolveActiveTenant` the shell uses, and hands the case id to the client view. Whether the
 * caller may reach this case is the API's decision (`assigned` scope); the view renders its `404`.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { DocumentsView } from './DocumentsView';

export const metadata: Metadata = {
  title: 'Documentos · LegalConnect MX',
};

export default async function DocumentosPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}): Promise<React.JSX.Element> {
  const [{ caseId }, principal, activeTenant] = await Promise.all([
    params,
    getPrincipal(),
    readActiveTenantServer(),
  ]);
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === resolved.tenantId)
      : undefined;

  // The shell has already said what to do (same reasoning as `/clientes`).
  if (!membership) return <></>;

  return <DocumentsView caseId={caseId} archetype={membership.archetype} />;
}
