/**
 * T015 — the membership <-> position link. RLS scopes every read here to the
 * caller's own tenant (data-model.md), so "does not exist" and "belongs to another
 * tenant" already collapse into the same `null`/no-row result before any business
 * check runs.
 *
 * Interface + `Db...` implementation, mirroring `common/tenant/membership.ts`'s
 * `MembershipPort` shape — what lets T013's independence test exercise
 * `DirectoryEntryService` against a fake, with no database at all.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import type { Cursor } from '../../common/http/pagination';

export const DIRECTORY_ENTRY_REPOSITORY = Symbol('DIRECTORY_ENTRY_REPOSITORY');

export interface CatalogPosition {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
}

export interface LiveMembership {
  readonly id: string;
  readonly tenantId: string;
}

export interface DirectoryListRow {
  readonly membershipId: string;
  readonly archetype: string;
  readonly positionId: string | null;
  readonly positionName: string | null;
  readonly createdAt: string;
}

export interface DirectoryEntryRepository {
  /** A foreign or absent id resolves to `null` — RLS-scoped (FR-010). */
  findPosition(positionId: string): Promise<CatalogPosition | null>;
  /** A foreign, absent or revoked membership resolves to `null` (FR-001). */
  findLiveMembership(membershipId: string): Promise<LiveMembership | null>;
  /** `null` covers both "no directory entry row yet" and "row with no position set" (research.md D1). */
  currentPosition(membershipId: string): Promise<string | null>;
  /** Upsert on first assignment (research.md D1); plain write, no lock (research.md D5). */
  upsertPosition(membershipId: string, tenantId: string, positionId: string | null): Promise<void>;
  /** T025 (US3) — every live membership of the active tenant, with its position if any. */
  listDirectory(limit: number, cursor?: Cursor): Promise<readonly DirectoryListRow[]>;
}

interface PositionRow {
  id: string;
  name: string;
  status: 'active' | 'retired';
  [key: string]: unknown;
}

interface MembershipRow {
  id: string;
  tenant_id: string;
  [key: string]: unknown;
}

interface DirectoryListRawRow {
  membership_id: string;
  archetype: string;
  position_id: string | null;
  position_name: string | null;
  created_at: string;
  [key: string]: unknown;
}

@Injectable()
export class DbDirectoryEntryRepository implements DirectoryEntryRepository {
  async findPosition(positionId: string): Promise<CatalogPosition | null> {
    const { rows } = await currentTx().execute<PositionRow>(sql`
      SELECT id, name, status FROM position WHERE id = ${positionId}::uuid
    `);
    const row = rows[0];
    return row ? { id: row.id, name: row.name, status: row.status } : null;
  }

  async findLiveMembership(membershipId: string): Promise<LiveMembership | null> {
    const { rows } = await currentTx().execute<MembershipRow>(sql`
      SELECT id, tenant_id FROM membership WHERE id = ${membershipId}::uuid AND status = 'live'
    `);
    const row = rows[0];
    return row ? { id: row.id, tenantId: row.tenant_id } : null;
  }

  async currentPosition(membershipId: string): Promise<string | null> {
    const { rows } = await currentTx().execute<{ position_id: string | null }>(sql`
      SELECT position_id FROM directory_entry WHERE membership_id = ${membershipId}::uuid
    `);
    return rows[0]?.position_id ?? null;
  }

  async upsertPosition(membershipId: string, tenantId: string, positionId: string | null): Promise<void> {
    await currentTx().execute(sql`
      INSERT INTO directory_entry (membership_id, tenant_id, position_id)
      VALUES (${membershipId}::uuid, ${tenantId}::uuid, ${positionId}::uuid)
      ON CONFLICT (membership_id) DO UPDATE SET position_id = excluded.position_id, updated_at = now()
    `);
  }

  async listDirectory(limit: number, cursor?: Cursor): Promise<readonly DirectoryListRow[]> {
    // FR-013/SC-010, common/http/pagination.ts verbatim: "created_at" is membership's
    // own, reused as the ordering field the generic `Cursor` shape names `occurredAt` —
    // this read has no timestamp of its own more natural than the membership row it
    // lists (research.md's read is entirely derived from membership + directory_entry).
    const cursorCondition = cursor
      ? sql`AND (m.created_at, m.id) < (${cursor.occurredAt}::timestamptz, ${cursor.id}::uuid)`
      : sql``;

    const { rows } = await currentTx().execute<DirectoryListRawRow>(sql`
      SELECT m.id AS membership_id, m.archetype, m.created_at,
             de.position_id, p.name AS position_name
        FROM membership m
        LEFT JOIN directory_entry de ON de.membership_id = m.id
        LEFT JOIN position p ON p.id = de.position_id
       WHERE m.status = 'live'
       ${cursorCondition}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${limit + 1}
    `);

    return rows.map((row) => ({
      membershipId: row.membership_id,
      archetype: row.archetype,
      positionId: row.position_id,
      positionName: row.position_name,
      createdAt: row.created_at,
    }));
  }
}
