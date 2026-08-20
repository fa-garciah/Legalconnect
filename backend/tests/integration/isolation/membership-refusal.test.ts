/**
 * T040 — US1 scenario 7 / FR-022. A request naming a tenant the identity holds no live
 * membership in is refused, and recorded as a cross-tenant attempt.
 *
 * This is the check that runs BEFORE any query. RLS catches whatever gets past it —
 * both paths need testing, because the first is application code that can regress and
 * the second is the guarantee that survives when it does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolvePrincipal } from '../../../src/common/tenant/resolve';
import {
  InMemoryMembershipPort,
  type MembershipRecord,
} from '../../../src/common/tenant/membership';
import { shouldAudit } from '../../../src/common/tenant/refusals';
import { closeAppDb } from '../../../src/common/db/client';
import {
  IDENTITY_DUAL,
  IDENTITY_OUTSIDER,
  IDENTITY_SINGLE,
  membershipFixtures,
  seededTenantIds,
  type SeededTenants,
} from '../../helpers/tenants';

describe('membership verification before activation', () => {
  let tenants: SeededTenants;
  let port: InMemoryMembershipPort;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    port = new InMemoryMembershipPort(membershipFixtures(tenants));
  });

  afterAll(async () => {
    await closeAppDb();
  });

  it('activates when a live membership joins identity and tenant', async () => {
    const result = await resolvePrincipal(
      { identityId: IDENTITY_SINGLE.id, tenantId: tenants.a },
      port,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.principal.tenantId).toBe(tenants.a);
      expect(result.principal.archetype).toBe('SA');
    }
  });

  it('refuses an identity with no membership in the named tenant', async () => {
    const result = await resolvePrincipal(
      { identityId: IDENTITY_OUTSIDER.id, tenantId: tenants.a },
      port,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_live_membership');
  });

  it('refuses a revoked membership', async () => {
    const revoked: MembershipRecord = {
      id: 'mm-revoked',
      identityId: IDENTITY_OUTSIDER.id,
      tenantId: tenants.b,
      archetype: 'SA',
      status: 'revoked',
    };
    const withRevoked = new InMemoryMembershipPort([...membershipFixtures(tenants), revoked]);

    const result = await resolvePrincipal(
      { identityId: IDENTITY_OUTSIDER.id, tenantId: tenants.b },
      withRevoked,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('membership_revoked');
  });

  it('refuses when no identity is supplied', async () => {
    const result = await resolvePrincipal({ tenantId: tenants.a }, port);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_identity');
  });

  it('refuses when no tenant is named, rather than picking one', async () => {
    // FR-021 means an identity may hold several memberships, so there is no single
    // tenant to derive. Guessing would be the bug.
    const result = await resolvePrincipal({ identityId: IDENTITY_DUAL.id }, port);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_tenant_named');
  });

  it('audits the membership refusals and not the malformed ones', async () => {
    // Recording an entry for every request that forgot a header would let anyone
    // inflate a tenant's audit volume from outside.
    expect(shouldAudit('no_live_membership')).toBe(true);
    expect(shouldAudit('membership_revoked')).toBe(true);
    expect(shouldAudit('no_identity')).toBe(false);
    expect(shouldAudit('no_tenant_named')).toBe(false);
    expect(shouldAudit('tenant_deactivated')).toBe(false);
  });
});
