/**
 * 008 T015 (Principle II). Who can read and touch a matter's notes and activity.
 *
 * Two boundaries, tested separately because they are enforced separately:
 *   - the FIRM, by RLS on `case_note` and `audit_event` — asserted as the real `lc_app` role, and
 *     through every route with another firm's ids;
 *   - the MATTER TEAM, by 006's resolver on every route — taken off a matter, a person loses its notes
 *     and its activity on the very next request.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../../helpers/real-app';
import { connectAs } from '../../helpers/db';
import { makeTimeFirm, unassign, type TimeFirm } from '../../helpers/time-entries';
import { noteCall } from '../../helpers/notes';

describe('note isolation (008)', () => {
  let app: INestApplication;
  let migration: Client;
  let a: TimeFirm;
  let b: TimeFirm;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    a = await makeTimeFirm(app, migration, 'CC Notas A');
    b = await makeTimeFirm(app, migration, 'CC Notas B');
    ids.a = (await noteCall(app, a.aa, a.tenantId).create(a.caseOn.id, { body: 'Firma A' })).body.id;
    ids.b = (await noteCall(app, b.aa, b.tenantId).create(b.caseOn.id, { body: 'Firma B' })).body.id;
    for (const [k, v] of Object.entries(ids)) if (!v) throw new Error(`fixture ${k} not created`);
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('lc_app acting in firm B reads none of firm A’s notes, and cannot delete one', async () => {
    const appClient = await connectAs('app');
    try {
      await appClient.query('BEGIN');
      await appClient.query(`SELECT set_config('app.tenant_id', $1, true)`, [b.tenantId]);
      const seen = (await appClient.query<{ id: string }>(`SELECT id FROM case_note`)).rows.map((r) => r.id);
      expect(seen).toContain(ids.b);
      expect(seen).not.toContain(ids.a);
      await expect(appClient.query(`DELETE FROM case_note WHERE id = $1`, [ids.b])).rejects.toThrow(/permission denied/);
    } finally {
      await appClient.query('ROLLBACK');
      await appClient.end();
    }
  });

  it('every route answers 404 for firm B’s matter from firm A — AA and MP alike — and writes nothing', async () => {
    for (const actor of [a.aa, a.mp]) {
      const call = noteCall(app, actor, a.tenantId);
      expect((await call.list(b.caseOn.id)).status).toBe(404);
      expect((await call.create(b.caseOn.id, { body: 'intento' })).status).toBe(404);
      expect((await call.correct(b.caseOn.id, ids.b!, { body: 'x' })).status).toBe(404);
      expect((await call.void(b.caseOn.id, ids.b!)).status).toBe(404);
      expect((await call.activity(b.caseOn.id)).status).toBe(404);
    }
    const { rows } = await migration.query(`SELECT body FROM case_note WHERE case_id = $1`, [b.caseOn.id]);
    expect(rows).toEqual([{ body: 'Firma B' }]);
  });

  it('firm B’s note id under firm A’s own matter is 404 to firm A’s MP', async () => {
    const call = noteCall(app, a.mp, a.tenantId);
    expect((await call.correct(a.caseOn.id, ids.b!, { body: 'x' })).status).toBe(404);
  });

  it('taken off a matter: its notes and activity are refused on the next request', async () => {
    const pl = noteCall(app, a.pl, a.tenantId);
    expect((await pl.list(a.caseOn.id)).status).toBe(200);
    expect((await pl.activity(a.caseOn.id)).status).toBe(200);
    await unassign(app, a, a.caseOn.id, a.pl);
    expect((await pl.list(a.caseOn.id)).status).toBe(404);
    expect((await pl.activity(a.caseOn.id)).status).toBe(404);
    expect((await pl.create(a.caseOn.id, { body: 'x' })).status).toBe(404);
  });
});
