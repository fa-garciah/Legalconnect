/**
 * 024 — `/`, the Dashboard Principal. Replaces `016a`'s placeholder (T028), which said it would give
 * way once there was something real to land on. Thin, like `/horas`: resolves the active membership's
 * archetype through the shell's own `resolveActiveTenant` and hands it to the client view.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { DashboardView } from './DashboardView';

export const metadata: Metadata = {
  title: 'Dashboard Principal · LegalConnect MX',
};

export default async function Home(): Promise<React.JSX.Element> {
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active' ? principal.memberships.find((m) => m.tenantId === resolved.tenantId) : undefined;

  if (!membership) return <></>;
  return <DashboardView archetype={membership.archetype} />;
}
