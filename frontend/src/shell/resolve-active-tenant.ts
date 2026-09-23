/**
 * Which firm the shell opens in, given what the browser remembers and what the API says.
 *
 * A REMEMBERED CHOICE IS A PREFERENCE, NEVER AN AUTHORITY. The active firm lives in a 30-day
 * cookie (`lc_active_tenant`), and a cookie outlives the thing it names: a membership that
 * was revoked, or — as found in the browser on 2026-09-22 — a whole database re-seeded with
 * new tenant ids. This used to return any `'active'` cookie untouched. The shell then found
 * no membership for it and told somebody who belongs to exactly ONE firm that they belonged
 * to several, with no switcher to act on (the switcher correctly hides below two firms).
 *
 * The cookie is now honoured only when it names a firm in `principal.memberships`, which is
 * what the API resolved under RLS a moment ago. Otherwise:
 *   - exactly one firm → enter it; there is nothing to choose;
 *   - several → ask. Auto-picking one of several is the wrong-firm-that-looks-right failure
 *     `016a`'s Story 2 names as the reason this directive exists.
 *
 * No security rests on this. Every request is re-authorised by the API against `membership`
 * under RLS, so a forged cookie reaches a refusal. This decides only what to RENDER.
 */
import type { ActiveTenant } from '../session/active-tenant';
import type { Principal } from '../session/types';

export function resolveActiveTenant(raw: ActiveTenant, principal: Principal): ActiveTenant {
  const memberships = principal.memberships;

  if (raw.status === 'active' && memberships.some((m) => m.tenantId === raw.tenantId)) {
    return raw;
  }

  if (memberships.length === 1) {
    return { status: 'active', tenantId: memberships[0]!.tenantId };
  }

  return { status: 'none' };
}
