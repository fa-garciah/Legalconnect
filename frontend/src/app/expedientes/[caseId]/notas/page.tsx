/**
 * 008 — `/expedientes/{caseId}/notas`. Thin, like `/documentos`: resolves the active membership's
 * archetype through the shell's own `resolveActiveTenant` and hands the case id to the client view.
 * Whether the caller reaches this matter is the API's decision (`assigned` scope).
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { NotesView } from './NotesView';

export const metadata: Metadata = {
  title: 'Notas · LegalConnect MX',
};

export default async function NotasPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}): Promise<React.JSX.Element> {
  const [{ caseId }, principal, activeTenant] = await Promise.all([params, getPrincipal(), readActiveTenantServer()]);
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active' ? principal.memberships.find((m) => m.tenantId === resolved.tenantId) : undefined;

  if (!membership) return <></>;
  return <NotesView caseId={caseId} archetype={membership.archetype} />;
}
