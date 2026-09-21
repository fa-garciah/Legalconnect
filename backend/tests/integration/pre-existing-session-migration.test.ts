/**
 * T044 — FR-025, SC-009. A session row that predates this slice's migration is
 * not force-signed-out by deploying it.
 *
 * `0040_session_lifecycle_columns.sql` adds `last_seen_at`/`family_created_at` as
 * `NOT NULL DEFAULT now()`, which PostgreSQL backfills for every pre-existing row
 * at migration time — so a session minted before this slice's deploy gets both
 * clocks anchored to roughly "when the migration ran", not to some stale or null
 * value that would make it look already idle/absolute-expired. This test
 * simulates that shape directly (inserting a session row without going through
 * `mintSession()`, the same way a backfilled row would look) and confirms it
 * authenticates normally under its own `expires_at`/refresh cycle — no new check
 * this slice adds treats "recently migrated" any differently from "freshly
 * minted".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity } from '../helpers/auth-seed';

describe('a session row that predates this slice is not force-signed-out (FR-025, SC-009)', () => {
  let app: INestApplication;
  let migration: Client;

  beforeAll(async () => {
    app = await createUnauthenticatedApp();
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  const server = () => app.getHttpServer();

  it('a session row with only its column DEFAULTs for the two new clocks authenticates normally', async () => {
    const identity = await seedAuthIdentity(migration, 'pre-existing-session', { factor: false });
    const accessToken = `pre-existing-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(accessToken, 'utf8').digest('hex');

    // No last_seen_at/family_created_at specified — exactly the shape a
    // pre-migration row backfilled by 0040's DEFAULT now() would have: both
    // clocks anchored to "around now", not absent and not zero.
    await migration.query(
      `INSERT INTO session (identity_id, access_digest, expires_at) VALUES ($1, $2, now() + interval '15 minutes')`,
      [identity.identityId, digest],
    );

    const response = await request(server())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
  });

  it('remains valid until its own expires_at, unaffected by having no prior touch_session() history', async () => {
    const identity = await seedAuthIdentity(migration, 'pre-existing-session-2', { factor: false });
    const accessToken = `pre-existing-token-2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(accessToken, 'utf8').digest('hex');

    await migration.query(
      `INSERT INTO session (identity_id, access_digest, expires_at) VALUES ($1, $2, now() + interval '15 minutes')`,
      [identity.identityId, digest],
    );

    const first = await request(server())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${accessToken}`);
    expect(first.status).toBe(200);

    // A second request, immediately after — still fine, and touch_session() has
    // now run at least once (from the first request) without incident.
    const second = await request(server())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${accessToken}`);
    expect(second.status).toBe(200);
  });
});
