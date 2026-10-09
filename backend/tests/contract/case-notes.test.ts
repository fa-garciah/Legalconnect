/**
 * 008 T009 — User Stories 1, 2 and 4: write a note, read a matter's notes by month, and the audit
 * trail of both (contracts/notes-activity-api.md §1–§2).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { makeTimeFirm, type TimeFirm } from '../helpers/time-entries';
import { mexicoMonth, noteCall } from '../helpers/notes';

describe('case notes (008, US1 / US2 / US4)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: TimeFirm;

  const audits = async (action: string, targetId: string) =>
    (
      await migration.query<{ metadata: Record<string, unknown> | null }>(
        `SELECT metadata FROM audit_event WHERE action = $1 AND target_id = $2 ORDER BY occurred_at`,
        [action, targetId],
      )
    ).rows;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeTimeFirm(app, migration, 'CC Notas');
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('an AA writes a note on a matter they are on; one note.created, without the text', async () => {
    const response = await noteCall(app, firm.aa, firm.tenantId).create(firm.caseOn.id, { body: '  El juez difirió la audiencia  ' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ body: 'El juez difirió la audiencia', own: true });
    expect(typeof response.body.correctableUntil).toBe('string');
    expect(response.body.author.membershipId).toBe(firm.aa.membershipId);
    const rows = await audits('note.created', response.body.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]!.metadata ?? {})).not.toContain('juez');
  });

  it('a visibility in the body is ignored — every note is internal (Decision 1)', async () => {
    const response = await noteCall(app, firm.pl, firm.tenantId).create(firm.caseOn.id, { body: 'Para el cliente', visibility: 'client' });
    expect(response.status).toBe(201);
    const { rows } = await migration.query<{ visibility: string }>(`SELECT visibility FROM case_note WHERE id = $1`, [response.body.id]);
    expect(rows[0]!.visibility).toBe('internal');
  });

  it.each([
    ['blank', { body: '   ' }],
    ['too long', { body: 'x'.repeat(5001) }],
    ['missing', {}],
  ])('refuses a %s body with 400', async (_label, body) => {
    expect((await noteCall(app, firm.cm, firm.tenantId).create(firm.caseOn.id, body)).status).toBe(400);
  });

  it('lists this month, newest first, with author position, and marks own notes', async () => {
    const aa = noteCall(app, firm.aa, firm.tenantId);
    const first = (await aa.create(firm.caseOn.id, { body: 'Primera' })).body.id as string;
    const second = (await noteCall(app, firm.cm, firm.tenantId).create(firm.caseOn.id, { body: 'Segunda' })).body.id as string;
    const response = await aa.list(firm.caseOn.id);
    expect(response.status).toBe(200);
    expect(response.body.month).toBe(mexicoMonth());
    const ids = (response.body.items as { id: string }[]).map((n) => n.id);
    expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));
    const byId = new Map((response.body.items as { id: string; own: boolean; correctableUntil: string | null }[]).map((n) => [n.id, n]));
    expect(byId.get(first)!.own).toBe(true);
    expect(byId.get(second)!.own).toBe(false);
    expect(byId.get(second)!.correctableUntil).toBeNull();
  });

  it('a note at 23:30 Mexico City time on the 31st stays in that month', async () => {
    const created = await noteCall(app, firm.aa, firm.tenantId).create(firm.caseOn.id, { body: 'Nocturna' });
    // 2026-08-01T05:30Z is 23:30 on 31 July in Mexico City.
    await migration.query(`UPDATE case_note SET created_at = '2026-08-01T05:30:00Z' WHERE id = $1`, [created.body.id]);
    const july = await noteCall(app, firm.aa, firm.tenantId).list(firm.caseOn.id, '2026-07');
    expect((july.body.items as { id: string }[]).map((n) => n.id)).toContain(created.body.id);
    const august = await noteCall(app, firm.aa, firm.tenantId).list(firm.caseOn.id, '2026-08');
    expect((august.body.items as { id: string }[]).map((n) => n.id)).not.toContain(created.body.id);
  });

  it('reading the list writes exactly one note.list_read naming the month — and none when automated (Decision 4)', async () => {
    const count = async () =>
      Number(
        (
          await migration.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM audit_event WHERE action = 'note.list_read' AND target_id = $1`,
            [firm.caseOn.id],
          )
        ).rows[0]!.n,
      );
    const before = await count();
    expect((await noteCall(app, firm.pl, firm.tenantId).list(firm.caseOn.id, '2026-09')).status).toBe(200);
    expect(await count()).toBe(before + 1);
    const [row] = (
      await migration.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM audit_event WHERE action = 'note.list_read' AND target_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
        [firm.caseOn.id],
      )
    ).rows;
    expect(row!.metadata).toEqual({ month: '2026-09' });
    expect((await noteCall(app, firm.pl, firm.tenantId, 'automated').list(firm.caseOn.id)).status).toBe(200);
    expect(await count()).toBe(before + 1);
  });

  it('a malformed month is 400', async () => {
    expect((await noteCall(app, firm.aa, firm.tenantId).list(firm.caseOn.id, '2026-13')).status).toBe(400);
  });

  it('an AA off the matter gets 404 on both — like a matter that does not exist', async () => {
    const aa = noteCall(app, firm.aa, firm.tenantId);
    const off = await aa.list(firm.caseOff.id);
    const none = await aa.list('00000000-0000-4000-8000-0000000000ab');
    expect(off.status).toBe(404);
    expect(off.body).toEqual(none.body);
    expect((await aa.create(firm.caseOff.id, { body: 'x' })).status).toBe(404);
  });

  it('an MP reaches every matter of the firm', async () => {
    expect((await noteCall(app, firm.mp, firm.tenantId).create(firm.caseOff.id, { body: 'Supervisión' })).status).toBe(201);
  });

  it('BM and SA are refused (403) — notes are privileged work product (Decision 6)', async () => {
    for (const actor of [firm.bm, firm.sa]) {
      const call = noteCall(app, actor, firm.tenantId);
      expect((await call.list(firm.caseOn.id)).status).toBe(403);
      expect((await call.create(firm.caseOn.id, { body: 'x' })).status).toBe(403);
    }
  });
});
