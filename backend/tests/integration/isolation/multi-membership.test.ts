/**
 * T041 / quickstart V10 / SC-014 — an identity holding membership in two tenants sees
 * only the active one, and nothing reveals that the other membership exists.
 *
 * This scenario only exists because research.md D1 chose separate identity and
 * membership. Under one-tenant-per-user it would be untestable and the leak it guards
 * against would be structurally impossible. Having chosen the more capable model, this
 * is the check that pays for it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenant as tenantTable, auditEvent } from '../../../src/common/db/schema';
import { closeAppDb } from '../../../src/common/db/client';
import { runInTenantContext } from '../../../src/common/tenant/middleware';
import { resolvePrincipal } from '../../../src/common/tenant/resolve';
import { InMemoryMembershipPort } from '../../../src/common/tenant/membership';
import {
  IDENTITY_DUAL,
  membershipFixtures,
  seededTenantIds,
  type SeededTenants,
} from '../../helpers/tenants';

describe('dual-membership containment', () => {
  let tenants: SeededTenants;
  let port: InMemoryMembershipPort;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    port = new InMemoryMembershipPort(membershipFixtures(tenants));
  });

  afterAll(async () => {
    await closeAppDb();
  });

  async function activate(tenantId: string) {
    const result = await resolvePrincipal({ identityId: IDENTITY_DUAL.id, tenantId }, port);
    if (!result.ok) throw new Error(`expected activation to succeed: ${result.reason}`);
    return result.principal;
  }

  it('carries a different archetype in each tenant — FR-024', async () => {
    // The archetype belongs to the membership, not the identity. Same person, two
    // roles, and neither tenant's view of them is affected by the other.
    expect((await activate(tenants.a)).archetype).toBe('MP');
    expect((await activate(tenants.b)).archetype).toBe('IC');
  });

  it('sees only tenant A while A is active', async () => {
    const principal = await activate(tenants.a);
    const rows = await runInTenantContext(principal, async (tx) =>
      tx.select({ id: tenantTable.id }).from(tenantTable),
    );
    expect(rows.map((r) => r.id)).toEqual([tenants.a]);
  });

  it('sees only tenant B while B is active', async () => {
    const principal = await activate(tenants.b);
    const rows = await runInTenantContext(principal, async (tx) =>
      tx.select({ id: tenantTable.id }).from(tenantTable),
    );
    expect(rows.map((r) => r.id)).toEqual([tenants.b]);
  });

  it('never reveals the other tenant’s identifier through the audit log', async () => {
    const principal = await activate(tenants.a);
    const rows = await runInTenantContext(principal, async (tx) =>
      tx.select({ tenantId: auditEvent.tenantId }).from(auditEvent),
    );

    expect(rows.length, 'A must see its own entries').toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([tenants.a]));
  });

  it('leaks nothing about the count of other memberships', async () => {
    // The set of tenants an identity belongs to is not tenant-visible data (FR-023).
    // Whatever a tenant can read about this identity must be identical whether the
    // second membership exists or not.
    const soloPort = new InMemoryMembershipPort(
      membershipFixtures(tenants).filter((m) => m.tenantId !== tenants.b),
    );

    const withBoth = await resolvePrincipal(
      { identityId: IDENTITY_DUAL.id, tenantId: tenants.a },
      port,
    );
    const withOne = await resolvePrincipal(
      { identityId: IDENTITY_DUAL.id, tenantId: tenants.a },
      soloPort,
    );

    expect(withBoth.ok && withOne.ok).toBe(true);
    if (withBoth.ok && withOne.ok) {
      expect(withBoth.principal).toEqual(withOne.principal);
    }
  });
});
