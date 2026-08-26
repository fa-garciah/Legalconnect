/**
 * T013 — `DbMembershipPort.find()` widened to return the tenant's plan in the SAME
 * round trip (research.md D7). Asserted by query text, not by timing: a second SELECT
 * against `tenant` or `plan` would mean a second query was added, which the
 * performance goal ("zero added queries for tenant/self/none scope kinds") forbids.
 */
import { Pool } from 'pg';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DbMembershipPort, InMemoryMembershipPort } from '../../src/common/tenant/membership';
import { closeAppDb } from '../../src/common/db/client';
import { resolvePrincipal } from '../../src/common/tenant/resolve';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';

/** Records every SQL statement text issued over a checked-out pool client. */
function captureQueries(): { texts: string[]; restore: () => void } {
  const texts: string[] = [];
  const originalConnect = Pool.prototype.connect;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Pool.prototype as any).connect = async function (...args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = await (originalConnect as any).apply(this, args);
    const originalQuery = client.query.bind(client);
    client.query = (...queryArgs: unknown[]) => {
      const first = queryArgs[0];
      const text = typeof first === 'string' ? first : ((first as { text?: string })?.text ?? '');
      texts.push(text);
      return originalQuery(...queryArgs);
    };
    return client;
  };

  return {
    texts,
    restore: () => {
      Pool.prototype.connect = originalConnect;
    },
  };
}

describe('DbMembershipPort.find() — plan joined into the same query', () => {
  let tenants: SeededTenants;
  let identities: SeededIdentities;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    identities = await seededIdentities();
  });

  afterEach(async () => {
    await closeAppDb();
  });

  it('returns planEntitlements and planLimits for the tenant\'s plan', async () => {
    const port = new DbMembershipPort();
    const record = await port.find(identities.dualId, tenants.a);

    expect(record).not.toBeNull();
    expect(record?.planLimits).toBeDefined();
    expect(record?.planEntitlements).toBeDefined();
    // Seeded: tenant A is on the "profesional" plan (drizzle/seed.ts).
    expect(record?.planLimits?.users).toBe(25);
  });

  it('issues exactly one SELECT joining membership, tenant and plan — no second round trip', async () => {
    const capture = captureQueries();
    try {
      const port = new DbMembershipPort();
      await port.find(identities.dualId, tenants.a);
    } finally {
      capture.restore();
    }

    const selects = capture.texts.filter((t) => /^\s*SELECT/i.test(t));
    const membershipJoinSelects = selects.filter(
      (t) => /FROM membership/i.test(t) && /JOIN tenant/i.test(t) && /JOIN plan/i.test(t),
    );
    expect(membershipJoinSelects).toHaveLength(1);

    // No OTHER select independently targets tenant or plan as its own FROM clause —
    // the join above is the only place either table is read.
    const standaloneTenantOrPlanSelects = selects.filter(
      (t) => !membershipJoinSelects.includes(t) && (/FROM tenant\b/i.test(t) || /FROM plan\b/i.test(t)),
    );
    expect(standaloneTenantOrPlanSelects).toHaveLength(0);
  });

  it('resolvePrincipal surfaces the plan on ActivePrincipal.plan', async () => {
    const port = new DbMembershipPort();
    const result = await resolvePrincipal({ identityId: identities.dualId, tenantId: tenants.a }, port);

    if (!result.ok) throw new Error('expected activation to succeed');
    expect(result.principal.plan).not.toBeNull();
    expect(result.principal.plan?.limits.users).toBe(25);
    expect(typeof result.principal.plan?.entitlements).toBe('object');
  });

  it('InMemoryMembershipPort fixtures still return plan: null — 001\'s tests keep compiling untouched', async () => {
    // A real, active seeded tenant so activation reaches the plan-mapping step —
    // what's under test is that a fixture supplying no plan fields at all maps to
    // `plan: null`, not whether a fictitious tenant activates.
    const fixtureIdentityId = '00000000-0000-4000-8000-000000000001';
    const port = new InMemoryMembershipPort([
      {
        id: 'm-1',
        identityId: fixtureIdentityId,
        tenantId: tenants.a,
        archetype: 'SA',
        status: 'live',
      },
    ]);
    const result = await resolvePrincipal({ identityId: fixtureIdentityId, tenantId: tenants.a }, port);
    if (!result.ok) throw new Error('expected activation to succeed');
    expect(result.principal.plan).toBeNull();
  });
});
