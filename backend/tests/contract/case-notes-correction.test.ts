/**
 * 008 T011 — User Story 3: an author corrects or voids their own note within 24 hours (Decision 3,
 * contracts/notes-activity-api.md §3–§4). Never another person's, never after the window, never a
 * deletion.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { makeTimeFirm, type TimeFirm } from '../helpers/time-entries';
import { noteCall } from '../helpers/notes';

describe('correcting and voiding a note (008, US3)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: TimeFirm;

  const write = async (body = 'Original') =>
    (await noteCall(app, firm.aa, firm.tenantId).create(firm.caseOn.id, { body })).body.id as string;

  const auditMetadata = async (action: string, id: string) =>
    (
      await migration.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM audit_event WHERE action = $1 AND target_id = $2`,
        [action, id],
      )
    ).rows.map((r) => r.metadata);

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeTimeFirm(app, migration, 'CC Notas Correccion');
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('the author corrects a fresh note; the audit names the field, never the text', async () => {
    const id = await write();
    const response = await noteCall(app, firm.aa, firm.tenantId).correct(firm.caseOn.id, id, { body: 'Corregida' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, body: 'Corregida', own: true });
    expect(await auditMetadata('note.corrected', id)).toEqual([{ changed: ['body'] }]);
  });

  it('an unchanged correction records changed: []', async () => {
    const id = await write('Igual');
    expect((await noteCall(app, firm.aa, firm.tenantId).correct(firm.caseOn.id, id, { body: 'Igual' })).status).toBe(200);
    expect(await auditMetadata('note.corrected', id)).toEqual([{ changed: [] }]);
  });

  it('a voided note leaves the list but keeps its row; a second void is 409 note_voided', async () => {
    const aa = noteCall(app, firm.aa, firm.tenantId);
    const id = await write('Para anular');
    expect((await aa.void(firm.caseOn.id, id)).body).toEqual({ id });
    expect(((await aa.list(firm.caseOn.id)).body.items as { id: string }[]).map((n) => n.id)).not.toContain(id);
    const { rows } = await migration.query<{ status: string }>(`SELECT status FROM case_note WHERE id = $1`, [id]);
    expect(rows[0]!.status).toBe('voided');
    expect(await auditMetadata('note.voided', id)).toHaveLength(1);
    const again = await aa.void(firm.caseOn.id, id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('note_voided');
    expect((await aa.correct(firm.caseOn.id, id, { body: 'x' })).body.error.code).toBe('note_voided');
  });

  it('after 24 hours the window is closed: 409 correction_window_closed, and correctableUntil is null', async () => {
    const aa = noteCall(app, firm.aa, firm.tenantId);
    const id = await write('Antigua');
    await migration.query(`UPDATE case_note SET created_at = now() - interval '25 hours' WHERE id = $1`, [id]);
    for (const response of [await aa.correct(firm.caseOn.id, id, { body: 'x' }), await aa.void(firm.caseOn.id, id)]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('correction_window_closed');
    }
    const month = await migration.query<{ m: string }>(
      `SELECT to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM') AS m FROM case_note WHERE id = $1`,
      [id],
    );
    const listed = ((await aa.list(firm.caseOn.id, month.rows[0]!.m)).body.items as { id: string; correctableUntil: string | null }[]).find(
      (n) => n.id === id,
    );
    expect(listed!.correctableUntil).toBeNull();
  });

  it("another person's note is 404 — the MP's included — as is a note on another matter", async () => {
    const id = await write('Ajena');
    for (const actor of [firm.pl, firm.cm, firm.mp]) {
      const call = noteCall(app, actor, firm.tenantId);
      expect((await call.correct(firm.caseOn.id, id, { body: 'x' })).status).toBe(404);
      expect((await call.void(firm.caseOn.id, id)).status).toBe(404);
    }
    const mpNote = (await noteCall(app, firm.mp, firm.tenantId).create(firm.caseOff.id, { body: 'Del socio' })).body.id as string;
    expect((await noteCall(app, firm.mp, firm.tenantId).correct(firm.caseOn.id, mpNote, { body: 'x' })).status).toBe(404);
    const { rows } = await migration.query<{ body: string }>(`SELECT body FROM case_note WHERE id = $1`, [id]);
    expect(rows[0]!.body).toBe('Ajena');
  });

  it('a blank correction is 400 and changes nothing', async () => {
    const id = await write('Intacta');
    expect((await noteCall(app, firm.aa, firm.tenantId).correct(firm.caseOn.id, id, { body: ' ' })).status).toBe(400);
  });
});
