/**
 * Shared response shaping for both the tenant-facing and platform audit reads
 * (T088, T090) — contracts/audit-query.md's item shape.
 */
import type { AuditEvent } from '../../common/db/schema';

export interface AuditEventResponseItem {
  readonly id: string;
  readonly occurredAt: string;
  readonly action: string;
  readonly actor: { readonly identityId: string | null; readonly membershipId: string | null };
  readonly targetEntity: string;
  readonly targetId: string | null;
  readonly source: unknown;
  readonly metadata: Record<string, unknown>;
}

export function presentAuditEvent(row: AuditEvent): AuditEventResponseItem {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    action: row.action,
    actor: { identityId: row.actorIdentityId, membershipId: row.actorMembershipId },
    targetEntity: row.targetEntity,
    targetId: row.targetId,
    source: row.source,
    metadata: row.metadata,
  };
}

/** `action` is optional and repeatable in the query grammar. */
export function parseActionFilter(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  return (Array.isArray(raw) ? raw : [raw]).map(String);
}

export function parseOptionalString(raw: unknown): string | undefined {
  return raw === undefined ? undefined : String(raw);
}
