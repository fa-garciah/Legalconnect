/**
 * T086 — the audit query repository. Time-bounded on every call so the planner can
 * prune partitions (research.md D7), which is what keeps SC-010's three-second first
 * page reachable as history grows.
 *
 * Tenant scoping is deliberately NOT a parameter here for the tenant-facing caller:
 * RLS already restricts `tx` to the active tenant when `tx` comes from
 * TenantContextInterceptor. The platform caller, whose `tx` carries no such
 * restriction, passes `tenantId` explicitly to narrow a genuinely cross-tenant read.
 */
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { auditEvent, type AuditEvent } from '../../common/db/schema';
import type { Tx } from '../../common/db/client';
import type { Cursor } from '../../common/http/pagination';

export interface AuditQueryFilter {
  readonly from: Date;
  readonly to: Date;
  readonly tenantId?: string;
  readonly action?: readonly string[];
  readonly targetEntity?: string;
  readonly targetId?: string;
  readonly cursor?: Cursor;
  readonly limit: number;
}

export async function queryAuditEvents(tx: Tx, filter: AuditQueryFilter): Promise<AuditEvent[]> {
  const conditions = [gte(auditEvent.occurredAt, filter.from), lte(auditEvent.occurredAt, filter.to)];

  if (filter.tenantId) conditions.push(eq(auditEvent.tenantId, filter.tenantId));
  if (filter.action && filter.action.length > 0) conditions.push(inArray(auditEvent.action, filter.action));
  if (filter.targetEntity) conditions.push(eq(auditEvent.targetEntity, filter.targetEntity));
  if (filter.targetId) conditions.push(eq(auditEvent.targetId, filter.targetId));
  if (filter.cursor) {
    // Newest-first feed: "older than the last row already served," expressed as a
    // row-value comparison so the composite (occurred_at, id) ordering — needed
    // because two entries can share a timestamp (FR-018) — has a single boundary
    // check rather than an OR of two conditions.
    conditions.push(
      sql`(${auditEvent.occurredAt}, ${auditEvent.id}) < (${filter.cursor.occurredAt}::timestamptz, ${filter.cursor.id}::uuid)`,
    );
  }

  return tx
    .select()
    .from(auditEvent)
    .where(and(...conditions))
    .orderBy(desc(auditEvent.occurredAt), desc(auditEvent.id))
    .limit(filter.limit + 1); // the extra row is toPage's existence proof for a next page
}
