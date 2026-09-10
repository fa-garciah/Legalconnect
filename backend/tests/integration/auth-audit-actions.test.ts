/**
 * T039 — the twelve audit actions, both halves. FR-044, research.md D12.
 *
 * WHY BOTH HALVES MATTER. A test that only checked "lc_auth can write these"
 * would pass against a policy that let everyone write them, and a test that only
 * checked "lc_app cannot" would pass against a database where the actions do not
 * exist at all. Each half is the other's control.
 *
 * The stakes are higher here than for 002's four. While the primary factor stays
 * phishable — Constitution Recognised Technical Debt item 1, and the constitution
 * FORBIDS claiming otherwise in commercial material — this log is the only
 * detection net the product has. A forged `signin.succeeded` or a suppressed
 * `account.locked` is an attack on the net itself, not on a record of an attack.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';

const AUTH_ACTIONS = [
  'enrollment.started',
  'enrollment.completed',
  'enrollment.failed',
  'factor.replaced',
  'backup_codes.issued',
  'backup_code.consumed',
  'backup_codes.exhausted',
  'backup_codes.reissued',
  'signin.succeeded',
  'signin.failed',
  'challenge.failed',
  'account.locked',
] as const;

describe('the twelve authentication audit actions (FR-044, D12)', () => {
  let app: Client;
  let auth: Client;
  let migration: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    app = await connectAs('app');
    auth = await connectAs('auth');
    migration = await connectAs('migration');
    tenants = await seededTenantIds();
  });

  afterAll(async () => {
    await app.end();
    await auth.end();
    await migration.end();
  });

  describe('lc_auth', () => {
    for (const action of AUTH_ACTIONS) {
      it(`CAN insert ${action} with a NULL tenant`, async () => {
        await expect(
          auth.query(
            `INSERT INTO audit_event (tenant_id, action, target_entity, source, metadata)
             VALUES (NULL, $1, 'identity', '{"channel":"interactive"}'::jsonb, '{}'::jsonb)`,
            [action],
          ),
        ).resolves.toBeDefined();
      });
    }

    it('CANNOT attribute an authentication event to a tenant, even deliberately', async () => {
      // The policy asserts `tenant_id IS NULL` in its WITH CHECK, so this is not
      // a convention the application is trusted to follow. Authentication
      // precedes tenant selection: at the moment a sign-in fails, no tenant has
      // been chosen and attributing one would mean inventing it.
      await expect(
        auth.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, source, metadata)
           VALUES ($1, 'signin.failed', 'identity', '{"channel":"interactive"}'::jsonb, '{}'::jsonb)`,
          [tenants.a],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('CANNOT write an action outside its twelve', async () => {
      // lc_auth must not be able to forge a tenant-domain event either. The
      // narrowing runs in both directions.
      await expect(
        auth.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, source, metadata)
           VALUES (NULL, 'client.created', 'client', '{"channel":"interactive"}'::jsonb, '{}'::jsonb)`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  describe('lc_app', () => {
    for (const action of AUTH_ACTIONS) {
      it(`CANNOT insert ${action}`, async () => {
        await app.query('BEGIN');
        try {
          await app.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenants.a]);
          await expect(
            app.query(
              `INSERT INTO audit_event (tenant_id, action, target_entity, source, metadata)
               VALUES ($1, $2, 'identity', '{"channel":"interactive"}'::jsonb, '{}'::jsonb)`,
              [tenants.a, action],
            ),
          ).rejects.toThrow(/row-level security/i);
        } finally {
          await app.query('ROLLBACK');
        }
      });
    }

    it('CAN still write its own tenant-domain actions — the refusals above are targeted', async () => {
      // Without this, a policy that refused everything would pass every test in
      // the block above while breaking the entire audit trail.
      await app.query('BEGIN');
      try {
        await app.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenants.a]);
        await expect(
          app.query(
            `INSERT INTO audit_event (tenant_id, action, target_entity, source, metadata)
             VALUES ($1, 'client.created', 'client', '{"channel":"interactive"}'::jsonb, '{}'::jsonb)`,
            [tenants.a],
          ),
        ).resolves.toBeDefined();
      } finally {
        await app.query('ROLLBACK');
      }
    });
  });

  it('mfa_not_enrolled is NOT in the vocabulary and stays unaudited (FR-039)', async () => {
    // Agreeing with 002's open item 3: a precondition failure by a legitimate
    // member is not a change of state and not a security signal. Asserted at the
    // CHECK constraint, so it cannot be written by any role at all.
    await expect(
      migration.query(
        `INSERT INTO audit_event (tenant_id, action, target_entity, source, metadata)
         VALUES (NULL, 'mfa_not_enrolled', 'identity', '{"channel":"interactive"}'::jsonb, '{}'::jsonb)`,
      ),
    ).rejects.toThrow(/audit_event_action_known/i);
  });

  it('all twelve are present in the CHECK constraint', async () => {
    // 0030 added them to the POLICY; 0036 added them to the VOCABULARY. Adding
    // one without the other is a runtime failure the type system cannot see, and
    // is exactly what happened during implementation.
    const { rows } = await migration.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'audit_event_action_known'`,
    );
    const definition = rows[0]!.def;
    for (const action of AUTH_ACTIONS) {
      expect(definition).toContain(action);
    }
  });
});
