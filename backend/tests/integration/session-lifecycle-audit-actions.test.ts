/**
 * T016 — the three new audit actions' write policy. FR-006, FR-021, research.md D8.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity } from '../helpers/auth-seed';

const NEW_ACTIONS = ['session.signed_out', 'stepup.verified', 'stepup.failed'] as const;

describe('session.signed_out / stepup.verified / stepup.failed write policy (D8)', () => {
  let app: Client;
  let auth: Client;
  let migration: Client;

  beforeAll(async () => {
    app = await connectAs('app');
    auth = await connectAs('auth');
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await app.end();
    await auth.end();
    await migration.end();
  });

  for (const action of NEW_ACTIONS) {
    it(`lc_app cannot insert ${action}`, async () => {
      const identity = await seedAuthIdentity(migration, 'audit-policy', { factor: false });
      await expect(
        app.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, actor_identity_id, source)
           VALUES (NULL, $1, 'session', $2, '{"channel":"interactive"}'::jsonb)`,
          [action, identity.identityId],
        ),
      ).rejects.toThrow(/permission denied|policy/i);
    });

    it(`lc_auth can insert ${action} with tenant_id NULL`, async () => {
      const identity = await seedAuthIdentity(migration, 'audit-policy-auth', { factor: false });
      await expect(
        auth.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, actor_identity_id, source)
           VALUES (NULL, $1, 'session', $2, '{"channel":"interactive"}'::jsonb)`,
          [action, identity.identityId],
        ),
      ).resolves.toBeDefined();
    });
  }
});
