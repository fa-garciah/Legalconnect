/**
 * 014-admin-ui T005 / Decision 5 — a firm's administrators may read their OWN members' email,
 * and nothing else about any identity.
 *
 * Migration 0044 adds the second `lc_app` SELECT policy on `identity` (the first,
 * `identity_self_row`, is the caller's own row). Policies OR together, so this suite is the
 * control that the new one widens nothing beyond what it names — the exact failure 0043's first
 * draft shipped and `membership-real-data.test.ts` caught:
 *
 *   - acting in firm A, a dual-membership identity reads A's members, never an identity whose
 *     only membership is in B;
 *   - a REVOKED membership in A exposes nothing;
 *   - with NO tenant active (the identity surface), no identity but the caller's own is readable.
 *
 * Connects as the real `lc_app` role: asking the owner proves nothing, it reads everything.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectAs } from '../../helpers/db';
import { seededTenantIds, type SeededTenants } from '../../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../../helpers/identities';

interface Fixture {
  readonly id: string;
  readonly email: string;
}

describe('member email isolation (014 Decision 5, migration 0044)', () => {
  let tenants: SeededTenants;
  let identities: SeededIdentities;
  let app: Client;
  let memberOfA: Fixture;
  let memberOfBOnly: Fixture;
  let revokedFromA: Fixture;

  async function createIdentity(label: string): Promise<Fixture> {
    const migration = await connectAs('migration');
    try {
      const email = `${label}-${randomUUID()}@example.com`;
      const { rows } = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
        [`idp|${label}-${randomUUID()}`, email],
      );
      return { id: rows[0]!.id, email };
    } finally {
      await migration.end();
    }
  }

  async function join(identityId: string, tenantId: string, status: 'live' | 'revoked') {
    const migration = await connectAs('migration');
    try {
      await migration.query(
        `INSERT INTO membership (identity_id, tenant_id, archetype, status, revoked_at)
         VALUES ($1, $2, 'AA', $3::membership_status, CASE WHEN $3::text = 'revoked' THEN now() END)`,
        [identityId, tenantId, status],
      );
    } finally {
      await migration.end();
    }
  }

  /** The emails `lc_app` can read, with the given settings active for one transaction. */
  async function readableEmails(settings: {
    tenantId?: string;
    identityId?: string;
  }): Promise<string[]> {
    await app.query('BEGIN');
    try {
      if (settings.tenantId) {
        await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [settings.tenantId]);
      }
      if (settings.identityId) {
        await app.query(`SELECT set_config('app.identity_id', $1, true)`, [settings.identityId]);
      }
      const { rows } = await app.query<{ email: string }>(`SELECT email FROM identity`);
      return rows.map((r) => r.email);
    } finally {
      await app.query('ROLLBACK');
    }
  }

  beforeAll(async () => {
    tenants = await seededTenantIds();
    identities = await seededIdentities();

    memberOfA = await createIdentity('email-iso-a');
    memberOfBOnly = await createIdentity('email-iso-b');
    revokedFromA = await createIdentity('email-iso-revoked');
    await join(memberOfA.id, tenants.a, 'live');
    await join(memberOfBOnly.id, tenants.b, 'live');
    await join(revokedFromA.id, tenants.a, 'revoked');

    app = await connectAs('app');
  });

  afterAll(async () => {
    await app?.end();
  });

  it('acting in firm A, reads the email of a live member of A', async () => {
    const emails = await readableEmails({ tenantId: tenants.a, identityId: identities.dualId });
    expect(emails).toContain(memberOfA.email);
  });

  it('acting in firm A, NEVER reads an email whose only membership is in firm B', async () => {
    const emails = await readableEmails({ tenantId: tenants.a, identityId: identities.dualId });
    expect(emails).not.toContain(memberOfBOnly.email);
  });

  it('acting in firm B, reads B’s member and not A’s', async () => {
    const emails = await readableEmails({ tenantId: tenants.b, identityId: identities.dualId });
    expect(emails).toContain(memberOfBOnly.email);
    expect(emails).not.toContain(memberOfA.email);
  });

  it('a revoked membership exposes nothing', async () => {
    const emails = await readableEmails({ tenantId: tenants.a, identityId: identities.dualId });
    expect(emails).not.toContain(revokedFromA.email);
  });

  it('an identity with no membership anywhere is never readable', async () => {
    const outsider = await readableEmails({ tenantId: tenants.a, identityId: identities.dualId });
    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ email: string }>(
        `SELECT email FROM identity WHERE id = $1`,
        [identities.outsiderId],
      );
      expect(outsider).not.toContain(rows[0]!.email);
    } finally {
      await migration.end();
    }
  });

  it('with NO tenant active, nothing but the caller’s own row is readable', async () => {
    const emails = await readableEmails({ identityId: memberOfA.id });
    expect(emails).toEqual([memberOfA.email]);
  });

  it('with neither setting, nothing at all is readable', async () => {
    expect(await readableEmails({})).toEqual([]);
  });
});
