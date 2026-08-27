/**
 * T010 — the client-side half of the active-tenant seam (research.md D2). A plain,
 * non-HttpOnly cookie: it carries only a tenant id, never a secret, and the actual
 * authorization boundary is enforced server-side by 002/004 regardless of what this
 * cookie says (FR-005, FR-022, FR-027). Read server-side for SSR by
 * `active-tenant.server.ts`, which Next.js 16's async `cookies()` API keeps separate
 * from this file so no server-only import reaches the client bundle.
 */
const COOKIE_NAME = 'lc_active_tenant';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type ActiveTenant =
  | { readonly status: 'none' }
  | { readonly status: 'active'; readonly tenantId: string };

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function readActiveTenantClient(): ActiveTenant {
  const tenantId = readCookie(COOKIE_NAME);
  return tenantId ? { status: 'active', tenantId } : { status: 'none' };
}

export function writeActiveTenantClient(tenantId: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(tenantId)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearActiveTenantClient(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}

export { COOKIE_NAME as ACTIVE_TENANT_COOKIE_NAME };
