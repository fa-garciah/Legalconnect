/**
 * The server-side half of the active-tenant seam (research.md D2). Next.js 16's
 * `cookies()` is async and read-only during Server Component rendering — this file is
 * imported only by Server Components (`layout.tsx`, `page.tsx`), never by client code,
 * so `next/headers`' server-only constraint never reaches the client bundle.
 */
import { cookies } from 'next/headers';
import { ACTIVE_TENANT_COOKIE_NAME, type ActiveTenant } from './active-tenant';

export async function readActiveTenantServer(): Promise<ActiveTenant> {
  const store = await cookies();
  const tenantId = store.get(ACTIVE_TENANT_COOKIE_NAME)?.value;
  return tenantId ? { status: 'active', tenantId } : { status: 'none' };
}
