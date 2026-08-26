/**
 * T011 — the three built-in scope resolvers, and `resolverFor`'s fail-closed default.
 * FR-013, FR-014. No NestJS, no database — the registry is populated at module load.
 */
import { describe, expect, it } from 'vitest';
import {
  noneScopeResolver,
  resolverFor,
  selfScopeResolver,
  tenantScopeResolver,
  type ScopeRequest,
} from '../../src/common/authz/scope';
import type { ActivePrincipal } from '../../src/common/tenant/principal';

const principal: ActivePrincipal = {
  identityId: 'identity-1',
  membershipId: 'membership-1',
  tenantId: 'tenant-a',
  archetype: 'SA',
};

function request(overrides: Partial<ScopeRequest> = {}): ScopeRequest {
  return {
    subject: 'SA',
    capability: 'audit.read_own_tenant',
    principal: null,
    identityId: null,
    targetTenantId: null,
    targetId: null,
    ...overrides,
  };
}

describe('tenantScopeResolver', () => {
  it('answers true inside the caller\'s own tenant', async () => {
    const ok = await tenantScopeResolver.resolve(request({ principal, targetTenantId: 'tenant-a' }));
    expect(ok).toBe(true);
  });

  it('answers false for any other tenant', async () => {
    const ok = await tenantScopeResolver.resolve(request({ principal, targetTenantId: 'tenant-b' }));
    expect(ok).toBe(false);
  });

  it('answers false with no principal or no target named', async () => {
    expect(await tenantScopeResolver.resolve(request({ targetTenantId: 'tenant-a' }))).toBe(false);
    expect(await tenantScopeResolver.resolve(request({ principal }))).toBe(false);
  });
});

describe('selfScopeResolver', () => {
  it('answers true when no target is named — the operation is inherently the caller\'s own', async () => {
    const ok = await selfScopeResolver.resolve(request({ identityId: 'identity-1', targetId: null }));
    expect(ok).toBe(true);
  });

  it('answers true only when a named target equals the caller\'s own identity', async () => {
    const ok = await selfScopeResolver.resolve(
      request({ identityId: 'identity-1', targetId: 'identity-1' }),
    );
    expect(ok).toBe(true);
  });

  it('answers false when a named target is someone else\'s record', async () => {
    const ok = await selfScopeResolver.resolve(
      request({ identityId: 'identity-1', targetId: 'identity-2' }),
    );
    expect(ok).toBe(false);
  });

  it('answers false when a target is named but the caller\'s identity is unknown', async () => {
    const ok = await selfScopeResolver.resolve(request({ identityId: null, targetId: 'identity-2' }));
    expect(ok).toBe(false);
  });
});

describe('noneScopeResolver', () => {
  it('always answers true', async () => {
    expect(await noneScopeResolver.resolve(request())).toBe(true);
  });
});

describe('resolverFor', () => {
  it('returns the built-in resolver for tenant, self and none', () => {
    expect(resolverFor('tenant')).toBe(tenantScopeResolver);
    expect(resolverFor('self')).toBe(selfScopeResolver);
    expect(resolverFor('none')).toBe(noneScopeResolver);
  });

  it('returns undefined for an unregistered kind (assigned, today)', () => {
    expect(resolverFor('assigned')).toBeUndefined();
  });
});
