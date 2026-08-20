/**
 * T043 / FR-005 — a cache read that omits the tenant prefix MISSES rather than
 * returning a foreign entry.
 *
 * Same fail-closed shape as the database layer. A cache is the easiest place for
 * isolation to quietly leak, because nothing about a plain string key announces which
 * firm it belongs to.
 */
import { describe, expect, it } from 'vitest';
import {
  TenantScopedCache,
  parseTenantCacheKey,
  tenantCacheKey,
} from '../../../src/common/tenant/cache-keys';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('tenant-scoped cache keys', () => {
  it('prefixes every key with the tenant', () => {
    const key = tenantCacheKey(TENANT_A, 'plan', 'limits');
    expect(key.startsWith(`t:${TENANT_A}:`)).toBe(true);
    expect(key).toContain('plan');
  });

  it('produces different keys for the same logical entry in different tenants', () => {
    expect(tenantCacheKey(TENANT_A, 'plan')).not.toBe(tenantCacheKey(TENANT_B, 'plan'));
  });

  it('round-trips the tenant back out of a key', () => {
    const parsed = parseTenantCacheKey(tenantCacheKey(TENANT_A, 'plan', 'limits'));
    expect(parsed).toEqual({ tenantId: TENANT_A, rest: 'plan:limits' });
  });

  it('returns null for an unprefixed key rather than guessing', () => {
    expect(parseTenantCacheKey('plan:limits')).toBeNull();
  });

  it('never returns another tenant’s entry', async () => {
    const cache = new TenantScopedCache();
    await cache.set(TENANT_A, 'plan', 'esencial');

    expect(await cache.get(TENANT_A, 'plan')).toBe('esencial');
    expect(await cache.get(TENANT_B, 'plan')).toBeUndefined();
  });

  it('misses when the raw key is read without a prefix', async () => {
    const cache = new TenantScopedCache();
    await cache.set(TENANT_A, 'plan', 'esencial');

    // Simulates the developer who reached past the helper.
    expect(cache.rawGet('plan')).toBeUndefined();
    expect(cache.rawGet(tenantCacheKey(TENANT_A, 'plan'))).toBe('esencial');
  });

  it('clears one tenant without touching another', async () => {
    const cache = new TenantScopedCache();
    await cache.set(TENANT_A, 'plan', 'a');
    await cache.set(TENANT_B, 'plan', 'b');

    await cache.clearTenant(TENANT_A);

    expect(await cache.get(TENANT_A, 'plan')).toBeUndefined();
    expect(await cache.get(TENANT_B, 'plan')).toBe('b');
  });

  it('refuses to build a key with no tenant id, rather than producing an unscoped one', () => {
    expect(() => tenantCacheKey('')).toThrow(/tenant id is required/i);
  });

  it('reports how many entries it holds', async () => {
    const cache = new TenantScopedCache();
    expect(cache.size).toBe(0);

    await cache.set(TENANT_A, 'plan', 'a');
    await cache.set(TENANT_B, 'plan', 'b');
    expect(cache.size).toBe(2);

    await cache.clearTenant(TENANT_A);
    expect(cache.size).toBe(1);
  });
});
