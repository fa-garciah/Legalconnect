/**
 * T015 — the directory entry's storage seam. 017/FR-001, FR-002, research.md D1.
 *
 * Every statement here runs on `currentTx()`, the transaction
 * `TenantContextInterceptor` opened with exactly one tenant activated. There is
 * deliberately no hand-written `tenant_id = ...` filter anywhere below: RLS
 * (`directory_entry_own_tenant`, `position_own_tenant`, both in
 * `backend/drizzle/0020`) is what scopes these reads and writes, the same
 * discipline 001 established and 002/004 kept. A membership or position of
 * another tenant is simply not visible to any of these queries, so the
 * cross-tenant refusal is the ordinary "no such row" path rather than a check
 * this file writes.
 *
 * `DirectoryEntryStore` is declared as an interface so the service can be tested
 * without a database (`tests/unit/directory-entry-independence.test.ts`) — the
 * independence of position and archetype is a property of the code, and it should
 * be assertable without Postgres in the picture.
 */
import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import type { Archetype } from '../../common/tenant/principal';
import type { Cursor } from '../../common/http/pagination';

export interface MembershipSubject {
  readonly id: string;
  readonly archetype: Archetype | string;
}

export interface CatalogPosition {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
}

export interface DirectoryEntryRow {
  readonly membershipId: string;
  readonly positionId: string | null;
  readonly positionName: string | null;
}

/** T025 — one line of the directory listing. contracts/directory-api.md §2. */
export interface DirectoryListingRow extends DirectoryEntryRow {
  readonly archetype: Archetype | string;
  /** The pagination module's cursor field, carrying the membership's creation time. */
  readonly occurredAt: string;
}

export interface DirectoryEntryStore {
  /** FR-001 — only a LIVE membership of the active tenant can carry a position. */
  findLiveMembership(membershipId: string): Promise<MembershipSubject | null>;
  /** FR-010 — resolves under RLS, so a foreign position reads as absent. */
  findPosition(positionId: string): Promise<CatalogPosition | null>;
  findEntry(membershipId: string): Promise<{ readonly positionId: string | null } | null>;
  upsertEntry(membershipId: string, positionId: string | null): Promise<DirectoryEntryRow>;
}

interface Row {
  [key: string]: unknown;
}

@Injectable()
export class DirectoryEntryRepository implements DirectoryEntryStore {
  async findLiveMembership(membershipId: string): Promise<MembershipSubject | null> {
    const { rows } = await currentTx().execute<Row & { id: string; archetype: string }>(sql`
      SELECT id, archetype FROM membership WHERE id = ${membershipId}::uuid AND status = 'live'
    `);
    const row = rows[0];
    return row ? { id: row.id, archetype: row.archetype } : null;
  }

  async findPosition(positionId: string): Promise<CatalogPosition | null> {
    const { rows } = await currentTx().execute<
      Row & { id: string; name: string; status: 'active' | 'retired' }
    >(sql`
      SELECT id, name, status FROM position WHERE id = ${positionId}::uuid
    `);
    const row = rows[0];
    return row ? { id: row.id, name: row.name, status: row.status } : null;
  }

  async findEntry(membershipId: string): Promise<{ readonly positionId: string | null } | null> {
    const { rows } = await currentTx().execute<Row & { position_id: string | null }>(sql`
      SELECT position_id FROM directory_entry WHERE membership_id = ${membershipId}::uuid
    `);
    const row = rows[0];
    return row ? { positionId: row.position_id } : null;
  }

  /**
   * research.md D1 — upsert, never a bare INSERT. A directory entry is created
   * lazily by the first assignment, so "is there a row yet" is not something a
   * caller should have to know; `ON CONFLICT (membership_id)` makes the first and
   * every subsequent assignment the same statement.
   *
   * `tenant_id` is taken from the setting the interceptor already established
   * rather than from the request, so a row can never be written into a tenant the
   * caller did not activate — and the policy's `WITH CHECK` would refuse it even
   * if this expression were wrong.
   */
  async upsertEntry(membershipId: string, positionId: string | null): Promise<DirectoryEntryRow> {
    const { rows } = await currentTx().execute<Row & { position_id: string | null; position_name: string | null }>(sql`
      WITH upserted AS (
        INSERT INTO directory_entry (membership_id, tenant_id, position_id)
        VALUES (
          ${membershipId}::uuid,
          NULLIF(current_setting('app.tenant_id', true), '')::uuid,
          ${positionId}::uuid
        )
        ON CONFLICT (membership_id)
        DO UPDATE SET position_id = excluded.position_id, updated_at = now()
        RETURNING membership_id, position_id
      )
      SELECT u.membership_id, u.position_id, p.name AS position_name
        FROM upserted u
        LEFT JOIN position p ON p.id = u.position_id
    `);
    const row = rows[0];
    if (!row) throw new Error('the directory entry upsert returned no row');
    return {
      membershipId,
      positionId: row.position_id,
      positionName: row.position_name,
    };
  }

  /**
   * T025 — the directory listing. FR-011, FR-013.
   *
   * `LEFT JOIN` twice, per research.md D1: a membership with no `directory_entry`
   * row at all and one whose `position_id` is NULL both read as "no position
   * assigned", so the read path needs no branch for the lazily-created row.
   *
   * `m.status = 'live'` is FR-004/SC-006: a revoked membership's entry is untouched
   * in storage and simply absent from the active listing.
   *
   * The one hand-written tenant predicate in this slice, and it is deliberate.
   * `membership` carries a SECOND permissive SELECT policy —
   * `membership_own_identity_select` (backend/drizzle/0013) — which exists so an
   * identity can enumerate its own memberships with no tenant activated. Postgres
   * ORs permissive policies together, so inside a tenant session that policy would
   * also admit the CALLER'S OWN memberships in OTHER tenants, and a dual-tenant
   * member reading firm A's directory would see their own firm B row in it. This
   * predicate narrows the union back to what FR-011 specifies. It is not a
   * substitute for RLS — every other tenant's rows are still invisible without it —
   * it is a narrowing against 002's deliberate self-enumeration seam.
   */
  async listDirectory(filter: {
    readonly limit: number;
    readonly cursor?: Cursor;
  }): Promise<readonly DirectoryListingRow[]> {
    // Newest-first, with the same row-value boundary comparison the audit read uses
    // over its own composite (occurred_at, id) ordering — two memberships can share
    // a creation timestamp, so the tiebreak has to be part of the same comparison.
    const after: SQL = filter.cursor
      ? sql`AND (m.created_at, m.id) < (${filter.cursor.occurredAt}::timestamptz, ${filter.cursor.id}::uuid)`
      : sql``;

    const { rows } = await currentTx().execute<
      Row & {
        membership_id: string;
        archetype: string;
        position_id: string | null;
        position_name: string | null;
        occurred_at: string;
      }
    >(sql`
      SELECT m.id            AS membership_id,
             m.archetype     AS archetype,
             d.position_id   AS position_id,
             p.name          AS position_name,
             m.created_at::text AS occurred_at
        FROM membership m
        LEFT JOIN directory_entry d ON d.membership_id = m.id
        LEFT JOIN position p        ON p.id = d.position_id
       WHERE m.status = 'live'
         AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
         ${after}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${filter.limit + 1}
    `);

    return rows.map((row) => ({
      membershipId: row.membership_id,
      archetype: row.archetype,
      positionId: row.position_id,
      positionName: row.position_name,
      occurredAt: row.occurred_at,
    }));
  }
}
