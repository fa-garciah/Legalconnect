/**
 * T028 — the default landing inside the shell. `016a` shipped it as placeholder text and said it
 * would redirect "once a domain slice adds its first real screen". Several have, so it does
 * (2026-10-29): every sign-in used to end here, on "Bienvenido a LegalConnect MX." and nothing
 * else, which the critique found was the low point of every working morning.
 *
 * The landing is the first section this person's archetype can open (`landingFor`), resolved
 * from the active membership the same way every other page resolves it. When `015`/EP01 builds a
 * real home screen, this renders it instead.
 */
import { redirect } from 'next/navigation';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantServer } from '@/session/active-tenant.server';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import { landingFor } from '@/shell/landing';

export default async function Home(): Promise<React.JSX.Element> {
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);
  const resolved = resolveActiveTenant(activeTenant, principal);
  const membership =
    resolved.status === 'active'
      ? principal.memberships.find((m) => m.tenantId === resolved.tenantId)
      : undefined;

  const landing = membership ? landingFor(membership.archetype) : null;
  if (landing) redirect(landing);

  // No active firm yet (the shell is already asking the person to pick one), or an archetype
  // with no section at all: nothing to send them to, so the page stays as it was.
  return (
    <div data-testid="page-content">
      <p>Bienvenido a LegalConnect MX.</p>
    </div>
  );
}
