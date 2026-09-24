/**
 * 013 — `/calendario`. Thin, like `/clientes`: resolves the active membership's archetype through
 * the shell's own `resolveActiveTenant` and hands it to the client view.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { CalendarView } from './CalendarView';

export const metadata: Metadata = {
  title: 'Calendario · LegalConnect MX',
};

export default async function CalendarioPage(): Promise<React.JSX.Element> {
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === resolved.tenantId)
      : undefined;

  if (!membership) return <></>;
  return <CalendarView archetype={membership.archetype} />;
}
