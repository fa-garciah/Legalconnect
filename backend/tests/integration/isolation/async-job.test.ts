/**
 * T042 / quickstart V12 / FR-005 — an asynchronous job is isolated exactly as a
 * request is.
 *
 * The constitution requires a cross-tenant leak test for every async job, not only
 * every endpoint. The tenant travels in the message ENVELOPE, not the payload, and the
 * worker runs the identical activation path — same membership verification, same
 * transaction-scoped setting.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvent } from '../../../src/common/db/schema';
import { closeAppDb } from '../../../src/common/db/client';
import { runJob, type JobEnvelope } from '../../../src/common/tenant/job-context';
import { InMemoryMembershipPort } from '../../../src/common/tenant/membership';
import {
  IDENTITY_OUTSIDER,
  IDENTITY_SINGLE,
  membershipFixtures,
  seededTenantIds,
  type SeededTenants,
} from '../../helpers/tenants';

describe('async job isolation', () => {
  let tenants: SeededTenants;
  let port: InMemoryMembershipPort;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    port = new InMemoryMembershipPort(membershipFixtures(tenants));
  });

  afterAll(async () => {
    await closeAppDb();
  });

  const envelope = (tenantId: string, identityId: string): JobEnvelope<null> => ({
    tenantId,
    identityId,
    payload: null,
  });

  it('sees only its own tenant’s rows', async () => {
    const tenantIds = await runJob(envelope(tenants.a, IDENTITY_SINGLE.id), port, async (tx) => {
      const rows = await tx.select({ tenantId: auditEvent.tenantId }).from(auditEvent);
      return rows.map((r) => r.tenantId);
    });

    expect(tenantIds.length, 'the job must see its own tenant’s rows').toBeGreaterThan(0);
    expect(new Set(tenantIds)).toEqual(new Set([tenants.a]));
  });

  it('refuses an envelope naming a tenant the identity has no membership in', async () => {
    await expect(
      runJob(envelope(tenants.a, IDENTITY_OUTSIDER.id), port, async () => 'should not run'),
    ).rejects.toThrow(/membership/i);
  });

  it('does not leak the activation between consecutive jobs on the same pool', async () => {
    // The setting is transaction-scoped, so job two must not inherit job one's tenant.
    const a = await runJob(envelope(tenants.a, IDENTITY_SINGLE.id), port, async (tx) => {
      const rows = await tx.select({ tenantId: auditEvent.tenantId }).from(auditEvent);
      return new Set(rows.map((r) => r.tenantId));
    });
    expect(a).toEqual(new Set([tenants.a]));

    await expect(
      runJob(envelope(tenants.b, IDENTITY_SINGLE.id), port, async () => 'x'),
    ).rejects.toThrow(/membership/i);
  });
});
