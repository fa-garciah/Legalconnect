/**
 * 014 — the `/configuracion` route.
 *
 * Thin, like `/clientes`: the shell is already mounted by the root layout, and this page resolves
 * only the active membership's archetype, through the same `resolveActiveTenant` the shell uses.
 *
 * An archetype outside SA/MP never sees the navigation item, but can still type the URL. It gets
 * a plain statement rather than a screen of hidden controls — and the API would refuse every
 * call anyway, which is the actual boundary.
 */
import type { Metadata } from 'next';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { ConfiguracionView } from './ConfiguracionView';

export const metadata: Metadata = {
  title: 'Configuración · LegalConnect MX',
};

export default async function ConfiguracionPage(): Promise<React.JSX.Element> {
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === resolved.tenantId)
      : undefined;

  // Same reasoning as `/clientes`: the shell has already said what to do.
  if (!membership) return <></>;

  if (membership.archetype !== 'SA' && membership.archetype !== 'MP') {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-display font-semibold tracking-tight">Configuración del despacho</h1>
        <p>Solo el administrador y los socios del despacho pueden ver esta sección.</p>
      </section>
    );
  }

  return <ConfiguracionView archetype={membership.archetype} />;
}
