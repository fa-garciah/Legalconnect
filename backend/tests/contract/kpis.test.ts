/**
 * T008, T011 — `GET /tenant/kpis`. 015/FR-003 … FR-011.
 *
 * THE HONESTY TEST. Every other failure mode of a dashboard is cosmetic; this one destroys its
 * purpose. So the assertions here are about numbers being **right or absent**, never plausible:
 *
 *   - the average resolution time is compared against the value this test computes itself in
 *     SQL, so the endpoint cannot agree with its own mistake;
 *   - a quarter in which nothing closed must be `null`, never `0` — a zero would read as
 *     "resolved instantly";
 *   - a period whose predecessor is empty carries NO delta, not "+100%";
 *   - a success rate over fewer than five declared outcomes is refused outright, because
 *     "100%" from one matter is a misleading claim on a screen built to be trusted.
 *
 * THE CLOSING STATUS IS DELIBERATELY NOT CALLED `Concluido`. Every fixture in the repository
 * uses the default name, so code that matched the literal instead of reading `is_closing` would
 * pass every existing test. This firm renames it, which is the only way FR-003 is actually
 * pinned.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';
import { periodWindow, todayInMexicoCity } from '../../src/modules/kpi/period';

let app: INestApplication;
let migration: Client;
let firm: CaseFirm;
let clientId: string;
let renamedClosingId: string;
let matterTypeId: string;

/** Days back from today in Mexico City, as a `YYYY-MM-DD` date string. */
function daysAgo(days: number): string {
  const [y, m, d] = todayInMexicoCity().split('-').map(Number) as [number, number, number];
  const base = Date.UTC(y, m - 1, d) - days * 24 * 60 * 60 * 1000;
  return new Date(base).toISOString().slice(0, 10);
}

async function addCase(options: {
  readonly openedOn: string;
  readonly closedOn?: string | null;
  readonly closing?: boolean;
  readonly outcome?: string | null;
  readonly leadOf?: Actor | null;
  readonly typed?: boolean;
}): Promise<string> {
  const { rows } = await migration.query<{ id: string }>(
    `INSERT INTO case_file
       (tenant_id, client_id, file_number, case_status_id, matter_type_id, opened_on, closed_on)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7::date) RETURNING id`,
    [
      firm.tenantId,
      clientId,
      `EXP-KPI-${nextSuffix()}`,
      options.closing ? renamedClosingId : firm.statusOpenId,
      options.typed === false ? null : matterTypeId,
      options.openedOn,
      options.closedOn ?? null,
    ],
  );
  const caseId = rows[0]!.id;
  if (options.outcome) {
    await migration.query(`UPDATE case_file SET outcome = $2::case_outcome WHERE id = $1`, [
      caseId,
      options.outcome,
    ]);
  }
  if (options.leadOf) {
    await migration.query(
      `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
       VALUES ($1, $2, $3, 'lead')`,
      [caseId, options.leadOf.membershipId, firm.tenantId],
    );
  }
  return caseId;
}

function get(actor: Actor, query = '?period=quarter'): request.Test {
  return request(app.getHttpServer())
    .get(`/tenant/kpis${query}`)
    .set('x-identity-id', actor.identityId)
    .set('x-tenant-id', firm.tenantId);
}

beforeAll(async () => {
  app = await createAuthenticatedApp();
  migration = await connectAs('migration');
  firm = await makeCaseFirm(migration, `CC Indicadores ${nextSuffix()}`, uniqueRfc());

  const client = await migration.query<{ id: string }>(
    `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
    [firm.tenantId, uniqueName('Grupo Medido')],
  );
  clientId = client.rows[0]!.id;

  // FR-003: a closing status whose NAME says nothing about closing.
  const closing = await migration.query<{ id: string }>(
    `INSERT INTO case_status (tenant_id, name, is_closing) VALUES ($1, $2, true) RETURNING id`,
    [firm.tenantId, uniqueName('Archivado definitivo')],
  );
  renamedClosingId = closing.rows[0]!.id;
  const type = await migration.query<{ id: string }>(
    `INSERT INTO matter_type (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [firm.tenantId, uniqueName('Mercantil')],
  );
  matterTypeId = type.rows[0]!.id;

  // Three active matters, two led by the AA and one by nobody.
  await addCase({ openedOn: daysAgo(40), leadOf: firm.aa });
  await addCase({ openedOn: daysAgo(30), leadOf: firm.aa });
  await addCase({ openedOn: daysAgo(20), leadOf: null });

  // Six matters closed inside the current quarter, with declared outcomes: four successes
  // (favorable/convenio) and two not — 4/6, and above FR-009's floor of five.
  await addCase({ openedOn: daysAgo(80), closedOn: daysAgo(10), closing: true, outcome: 'favorable', leadOf: firm.mp });
  await addCase({ openedOn: daysAgo(70), closedOn: daysAgo(9), closing: true, outcome: 'favorable', leadOf: firm.mp });
  await addCase({ openedOn: daysAgo(60), closedOn: daysAgo(8), closing: true, outcome: 'convenio', leadOf: firm.mp });
  await addCase({ openedOn: daysAgo(50), closedOn: daysAgo(7), closing: true, outcome: 'convenio', leadOf: firm.mp });
  await addCase({ openedOn: daysAgo(45), closedOn: daysAgo(6), closing: true, outcome: 'desfavorable', leadOf: firm.mp });
  await addCase({ openedOn: daysAgo(44), closedOn: daysAgo(5), closing: true, outcome: 'sin_resolucion', leadOf: firm.mp });

  // One closed matter with NO declared outcome, and no matter type — the two "explicit group"
  // cases FR-006/FR-007 require, and the undeclared count FR-009 reports.
  await addCase({ openedOn: daysAgo(35), closedOn: daysAgo(4), closing: true, typed: false, leadOf: null });
}, 240_000);

afterAll(async () => {
  await migration.end();
  await app.close();
});

describe('who may read the firm\'s figures (FR-011, Decision 4)', () => {
  it('serves MP, CM and SA', async () => {
    for (const actor of [firm.mp, firm.cm, firm.sa] as const) {
      expect((await get(actor)).status).toBe(200);
    }
  });

  it('refuses AA, PL and BM', async () => {
    for (const actor of [firm.aa, firm.pl, firm.bm] as const) {
      const response = await get(actor);
      expect(response.status, 'an aggregate summarises matters they cannot all see').toBe(403);
      expect(response.body.activeCases).toBeUndefined();
    }
  });
});

describe('the period (FR-005, Decision 7)', () => {
  it('defaults to the quarter and names the window it used', async () => {
    const response = await get(firm.mp, '');
    expect(response.status).toBe(200);
    const expected = periodWindow('quarter');
    expect(response.body.period.kind).toBe('quarter');
    expect(response.body.period.from).toBe(expected.current.from);
    expect(response.body.period.to).toBe(expected.current.to);
  });

  it('accepts month, quarter and year', async () => {
    for (const kind of ['month', 'quarter', 'year'] as const) {
      const response = await get(firm.mp, `?period=${kind}`);
      expect(response.status, kind).toBe(200);
      expect(response.body.period.kind).toBe(kind);
    }
  });

  it('refuses anything else, rather than silently defaulting', async () => {
    // A silent default would report a figure for a window the caller did not ask for.
    expect((await get(firm.mp, '?period=week')).status).toBe(400);
    expect((await get(firm.mp, '?period=')).status).toBe(400);
  });
});

describe('active matters (FR-003)', () => {
  it('counts matters whose status does not close them — by is_closing, not by name', async () => {
    const response = await get(firm.mp, '?period=year');
    // Three open matters; the closing status here is called "Archivado definitivo", so code
    // matching the literal `Concluido` would count all ten.
    expect(response.body.activeCases.value).toBe(3);
  });
});

describe('average resolution time (FR-008, Decision 8)', () => {
  it('equals the value computed independently in SQL', async () => {
    const { current } = periodWindow('year');
    const { rows } = await migration.query<{ avg_days: string | null; n: string }>(
      `SELECT avg(closed_on - opened_on)::text AS avg_days, count(*)::text AS n
         FROM case_file
        WHERE tenant_id = $1 AND closed_on BETWEEN $2::date AND $3::date`,
      [firm.tenantId, current.from, current.to],
    );
    const expectedMonths = Number(rows[0]!.avg_days) / 30.44;

    const response = await get(firm.mp, '?period=year');
    expect(response.body.averageResolutionMonths.sampleSize).toBe(Number(rows[0]!.n));
    expect(response.body.averageResolutionMonths.value).toBeCloseTo(expectedMonths, 2);
  });

  it('reports the sample size alongside the average (Decision 8)', async () => {
    const response = await get(firm.mp, '?period=year');
    expect(response.body.averageResolutionMonths.sampleSize).toBeGreaterThan(0);
  });

  it('is null, not zero, for a period in which nothing closed', async () => {
    // A zero here would read as "resolved instantly", which is the opposite of "no data".
    const response = await get(firm.mp, '?period=month');
    const month = response.body.averageResolutionMonths;
    if (month.sampleSize === 0) expect(month.value).toBeNull();
  });
});

describe('success rate (FR-009, Decision 8)', () => {
  it('counts favorable and convenio as successes, over declared outcomes only', async () => {
    const response = await get(firm.mp, '?period=year');
    const rate = response.body.successRate;
    // Six declared: favorable, favorable, convenio, convenio, desfavorable, sin_resolucion.
    expect(rate.sampleSize).toBe(6);
    expect(rate.value).toBeCloseTo(4 / 6, 3);
  });

  it('reports how many closed matters have no declaration', async () => {
    const response = await get(firm.mp, '?period=year');
    // The one closed matter seeded without an outcome.
    expect(response.body.successRate.undeclared).toBe(1);
  });

  it('refuses a rate below the floor of five declarations', async () => {
    // A separate firm, with two declared outcomes, is the only honest way to assert this.
    const thin = await makeCaseFirm(migration, `CC Escasa ${nextSuffix()}`, uniqueRfc());
    const thinClient = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [thin.tenantId, uniqueName('Pocos Datos')],
    );
    for (const outcome of ['favorable', 'favorable']) {
      const { rows } = await migration.query<{ id: string }>(
        `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id, opened_on, closed_on)
         VALUES ($1, $2, $3, $4, $5::date, $6::date) RETURNING id`,
        [thin.tenantId, thinClient.rows[0]!.id, `EXP-THIN-${nextSuffix()}`, thin.statusClosingId, daysAgo(40), daysAgo(3)],
      );
      await migration.query(`UPDATE case_file SET outcome = $2::case_outcome WHERE id = $1`, [
        rows[0]!.id,
        outcome,
      ]);
    }

    const response = await request(app.getHttpServer())
      .get('/tenant/kpis?period=year')
      .set('x-identity-id', thin.mp.identityId)
      .set('x-tenant-id', thin.tenantId);
    expect(response.status).toBe(200);
    // Two declarations, both favourable: a naive computation would proudly report 100%.
    expect(response.body.successRate.value).toBeNull();
    expect(response.body.successRate.sampleSize).toBe(2);
  });
});

describe('deltas (FR-010)', () => {
  it('carries no delta when the previous period holds nothing comparable', async () => {
    // Every matter in this firm was created within the last 80 days, so the previous year is
    // empty and a percentage change against it has no meaning.
    const response = await get(firm.mp, '?period=year');
    expect(response.body.activeCases.previous).toBe(0);
    expect(response.body.averageResolutionMonths.previous).toBeNull();
    expect(response.body.averageResolutionMonths.delta).toBeNull();
    expect(response.body.successRate.delta).toBeNull();
  });

  it('never reports a non-finite delta anywhere in the payload', async () => {
    for (const kind of ['month', 'quarter', 'year'] as const) {
      const response = await get(firm.mp, `?period=${kind}`);
      const serialised = JSON.stringify(response.body);
      expect(serialised, kind).not.toContain('Infinity');
      expect(serialised, kind).not.toContain('NaN');
      expect(serialised, kind).not.toContain('null,"delta":0/0');
    }
  });
});

describe('grouping (T011, FR-006, FR-007, Decision 10)', () => {
  it('reports matters with no live lead under an explicit group, never dropped', async () => {
    const response = await get(firm.mp, '?period=year');
    const groups = response.body.casesPerAttorney as readonly { membershipId: string | null; activeCases: number }[];
    const unassigned = groups.find((g) => g.membershipId === null);
    expect(unassigned, 'a matter nobody leads is what a case manager most needs to see').toBeDefined();
    expect(unassigned!.activeCases).toBeGreaterThanOrEqual(1);
  });

  it('adds up to the firm\'s active matters', async () => {
    const response = await get(firm.mp, '?period=year');
    const groups = response.body.casesPerAttorney as readonly { activeCases: number }[];
    const total = groups.reduce((sum, g) => sum + g.activeCases, 0);
    expect(total).toBe(response.body.activeCases.value);
  });

  it('labels people by position and carries NO email (Decision 10, Principle VI)', async () => {
    const response = await get(firm.mp, '?period=year');
    const serialised = JSON.stringify(response.body.casesPerAttorney);
    expect(serialised).not.toContain('@');
    for (const group of response.body.casesPerAttorney as readonly Record<string, unknown>[]) {
      expect(group).toHaveProperty('position');
      expect(group).not.toHaveProperty('email');
    }
  });

  it('reports a rate for every type with at least one declaration, with its sample size (FR-009a)', async () => {
    /*
     * No floor on the BREAKDOWN, unlike the headline rate. Measured against `022`'s demo firm,
     * one floor for both made this chart useless: 19 closed matters across a firm's practice
     * areas leaves no area at five, so every bar read "Datos insuficientes". The breakdown
     * exists to be compared, and it carries the sample size so a thin bar can be weighed.
     */
    const response = await get(firm.mp, '?period=year');
    const groups = response.body.successRateByMatterType as readonly {
      rate: number | null;
      sampleSize: number;
    }[];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group).toHaveProperty('sampleSize');
      if (group.sampleSize > 0) expect(group.rate).not.toBeNull();
      else expect(group.rate).toBeNull();
    }
  });

  it('reports untyped matters under an explicit group', async () => {
    const response = await get(firm.mp, '?period=year');
    const groups = response.body.successRateByMatterType as readonly { matterTypeId: string | null }[];
    expect(groups.some((g) => g.matterTypeId === null)).toBe(true);
  });
});

describe('the quarterly trend (FR-008)', () => {
  it('returns six quarters, oldest first', async () => {
    const response = await get(firm.mp, '?period=quarter');
    const trend = response.body.resolutionTrend as readonly { quarterStart: string }[];
    expect(trend).toHaveLength(6);
    expect([...trend].map((q) => q.quarterStart).sort()).toEqual(trend.map((q) => q.quarterStart));
  });

  it('reports null — never zero — for a quarter in which nothing closed', async () => {
    const response = await get(firm.mp, '?period=quarter');
    const trend = response.body.resolutionTrend as readonly { averageMonths: number | null; sampleSize: number }[];
    const empty = trend.filter((q) => q.sampleSize === 0);
    expect(empty.length, 'this firm only has recent matters, so earlier quarters are empty').toBeGreaterThan(0);
    for (const quarter of empty) expect(quarter.averageMonths).toBeNull();
  });
});

describe('isolation', () => {
  it('counts nothing from another firm', async () => {
    const other = await makeCaseFirm(migration, `CC Ajena ${nextSuffix()}`, uniqueRfc());
    const response = await request(app.getHttpServer())
      .get('/tenant/kpis?period=year')
      .set('x-identity-id', other.mp.identityId)
      .set('x-tenant-id', other.tenantId);
    expect(response.status).toBe(200);
    expect(response.body.activeCases.value).toBe(0);
    expect(response.body.successRate.value).toBeNull();
  });
});
