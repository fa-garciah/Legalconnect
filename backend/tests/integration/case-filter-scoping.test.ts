/**
 * T003 — 019/FR-033, and the reason this file is separate from `case-list-filters.test.ts`.
 *
 * **The two fail differently.** A filtering test asks *did I get the right rows*. This one
 * asks *did I get rows I was never entitled to*. The first can pass while the second fails,
 * because the failure mode here returns a **superset** — and a superset contains all the
 * right rows.
 *
 * The concrete failure it exists for: `AND` binds tighter than `OR`, so
 *
 *     EXISTS(assignment) AND file_number ILIKE x OR legal_name ILIKE x
 *
 * parses as `(EXISTS(assignment) AND file_number ILIKE x) OR (legal_name ILIKE x)`. The
 * second branch carries no assignment predicate at all, and every case in the tenant whose
 * client name matches is handed to a caller assigned to none of them. That is not a bug
 * about filtering. It is the ethical wall coming down, and the constitution puts tenant and
 * scope isolation on its non-negotiable coverage list.
 *
 * `019/contracts/case-list-filters.md` §2 states the shape that avoids it; this file is what
 * fails if the shape is ever broken — by this slice, or by a refactor two slices from now.
 *
 * Runs against real PostgreSQL as the application role, so RLS is live and the assignment
 * predicate is doing its own work rather than being simulated.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

interface ListItem {
  readonly id: string;
  readonly fileNumber: string;
}

describe('no filter reaches past the caller assignments', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;

  /**
   * The two matters. `mine` the AA is on; `theirs` they are not.
   *
   * Everything about them is deliberately distinguishable — different clients, different
   * matter types, different venues — so that a filter naming any part of `theirs` is an
   * unambiguous attempt to reach it. And their names share a token, so one search term can
   * match both, which is the case that catches a filter that replaced the assignment
   * predicate rather than joining it.
   */
  let mine: { id: string; fileNumber: string; clientName: string; matterTypeId: string; venueId: string };
  let theirs: { id: string; fileNumber: string; clientName: string; matterTypeId: string; venueId: string };

  /** The token both clients' names contain, so `q` can match the pair. */
  let shared: string;

  const list = (actor: Actor, query = '') =>
    request(app.getHttpServer())
      .get(`/tenant/cases${query}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', firm.tenantId);

  const idsFrom = (body: { items: ListItem[] }): string[] => body.items.map((item) => item.id);

  async function makeMatter(
    label: string,
    typeName: string,
    venueName: string,
  ): Promise<{ id: string; fileNumber: string; clientName: string; matterTypeId: string; venueId: string }> {
    const clientName = uniqueName(`${shared} ${label}`);
    const { rows: clientRows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, clientName],
    );
    const { rows: typeRows } = await migration.query<{ id: string }>(
      `INSERT INTO matter_type (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [firm.tenantId, uniqueName(typeName)],
    );
    const { rows: venueRows } = await migration.query<{ id: string }>(
      `INSERT INTO venue (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [firm.tenantId, uniqueName(venueName)],
    );

    const fileNumber = `EXP-${label}-${nextSuffix()}`;
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id, matter_type_id, venue_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        firm.tenantId,
        clientRows[0]!.id,
        fileNumber,
        firm.statusOpenId,
        typeRows[0]!.id,
        venueRows[0]!.id,
      ],
    );

    return {
      id: rows[0]!.id,
      fileNumber,
      clientName,
      matterTypeId: typeRows[0]!.id,
      venueId: venueRows[0]!.id,
    };
  }

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Filtros ${nextSuffix()}`, uniqueRfc());
    shared = `Compartido${nextSuffix()}`;

    mine = await makeMatter('MIO', 'Mercantil', 'Juzgado Civil');
    theirs = await makeMatter('AJENO', 'Fiscal', 'Sala Norte');

    // The AA is put on one matter and one only.
    await migration.query(
      `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
       VALUES ($1, $2, $3, 'lead')`,
      [mine.id, firm.aa.membershipId, firm.tenantId],
    );
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  describe('as an AA, who is on exactly one of the two matters', () => {
    it('does not return the unassigned matter when q names its file number', async () => {
      const response = await list(firm.aa, `?q=${encodeURIComponent(theirs.fileNumber)}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([]);
    });

    it('does not return the unassigned matter when q names its client', async () => {
      // The other side of the `OR`. Both halves need their own case: a predicate can be
      // parenthesised on one side of an implementation and not the other.
      const response = await list(firm.aa, `?q=${encodeURIComponent(theirs.clientName)}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([]);
    });

    it('returns only the assigned matter when q matches both', async () => {
      // The case that catches a filter which REPLACED the assignment predicate rather than
      // joining it. Both matters match; only one may come back.
      const response = await list(firm.aa, `?q=${encodeURIComponent(shared)}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([mine.id]);
    });

    it('does not return the unassigned matter when filtering by its matter type', async () => {
      const response = await list(firm.aa, `?matterTypeId=${theirs.matterTypeId}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([]);
    });

    it('does not return the unassigned matter when filtering by its venue', async () => {
      const response = await list(firm.aa, `?venueId=${theirs.venueId}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([]);
    });

    it('does not return the unassigned matter under all three filters at once', async () => {
      // Catches a `sql.join` with the wrong separator: three predicates that should narrow
      // together and instead widen.
      const response = await list(
        firm.aa,
        `?q=${encodeURIComponent(shared)}&matterTypeId=${theirs.matterTypeId}&venueId=${theirs.venueId}`,
      );

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([]);
    });

    it('still returns only the assigned matter when no filter is given', async () => {
      // The regression that matters most and is easiest to miss: a change that drops the
      // assignment predicate when the conditions array is otherwise empty.
      const response = await list(firm.aa);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([mine.id]);
    });

    it('treats a whitespace-only q as absent rather than as a way through', async () => {
      const response = await list(firm.aa, `?q=${encodeURIComponent('   ')}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([mine.id]);
    });
  });

  describe('as an MP, who is entitled to every matter in the firm', () => {
    it('returns the matter the AA cannot see, when filtered for it', async () => {
      /*
       * The inverse regression, and it is not symmetry for its own sake. A filter written
       * as an over-eager `AND` against the assignment table — rather than composed with the
       * `EXISTS` that MP/SA do not get — would hide matters from someone entitled to all of
       * them. That failure returns a subset, so it looks like "the filter works" until
       * somebody notices their own firm's caseload is short.
       */
      const response = await list(firm.mp, `?matterTypeId=${theirs.matterTypeId}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([theirs.id]);
    });

    it('returns both matters when q matches both', async () => {
      const response = await list(firm.mp, `?q=${encodeURIComponent(shared)}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body).sort()).toEqual([mine.id, theirs.id].sort());
    });
  });
});
