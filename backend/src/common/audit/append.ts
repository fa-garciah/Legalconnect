/**
 * The audit append primitive.
 *
 * The entry is written inside the MUTATION'S OWN transaction (research.md D6). That is
 * the only arrangement that makes FR-017 true: if the append fails, the transaction
 * rolls back and the mutation has no effect. It is also why the log lives in this
 * database rather than an external append-only sink — a sink would give stronger
 * immutability but could not join the transaction, so a mutation could commit with no
 * trail. A guaranteed record with a weaker immutability boundary is worth more than a
 * stronger boundary that sometimes has no record.
 */
import { sql } from 'drizzle-orm';
import { auditEvent } from '../db/schema';
import type { AuditSource } from '../db/schema';
import type { Tx } from '../db/client';
import { shouldEmit, type AuditAction } from './actions';
import { assertNoSensitiveData } from './sanitise';

export interface AppendInput {
  readonly tenantId: string;
  readonly action: AuditAction;
  readonly targetEntity: string;
  readonly targetId?: string | null;
  readonly actorIdentityId?: string | null;
  readonly actorMembershipId?: string | null;
  readonly source: AuditSource;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Appends one entry, unless the action is channel-gated and the channel is automated
 * (FR-025, FR-026). Returns whether an entry was written, so callers and tests can
 * assert both directions rather than only the silent one.
 *
 * `occurredAt` is deliberately not settable: it defaults to the database clock
 * (FR-020). A caller-supplied timestamp would make the log unorderable in exactly the
 * incident where order matters.
 */
export async function appendAuditEntry(tx: Tx, input: AppendInput): Promise<boolean> {
  if (!shouldEmit(input.action, input.source.channel)) return false;

  // The choke point for FR-012, placed here rather than in the interceptor so that
  // every path crosses it — jobs and direct callers included, not only HTTP. Refuses
  // rather than strips; see sanitise.ts for why, and note that refusing inside the
  // mutation's transaction rolls the mutation back with it (FR-017).
  assertNoSensitiveData(input.metadata ?? {});

  await tx.insert(auditEvent).values({
    tenantId: input.tenantId,
    action: input.action,
    targetEntity: input.targetEntity,
    targetId: input.targetId ?? null,
    actorIdentityId: input.actorIdentityId ?? null,
    actorMembershipId: input.actorMembershipId ?? null,
    source: input.source,
    metadata: input.metadata ?? {},
    occurredAt: sql`clock_timestamp()`,
  });

  return true;
}

/**
 * Records a cross-tenant attempt against the TARGETED tenant, through the narrow
 * definer function.
 *
 * Note what this signature cannot express: the actor's home tenant. It is absent by
 * design (FR-023). Telling firm B that a member of firm A reached for its matter
 * would disclose that firm A exists and is adjacent to that matter, which in this
 * domain can itself be privileged.
 */
export async function appendCrossTenantAttempt(
  tx: Tx,
  input: {
    readonly targetTenantId: string;
    readonly targetEntity: string;
    readonly targetId?: string | null;
    readonly actorIdentityId?: string | null;
    readonly source: AuditSource;
  },
): Promise<void> {
  await tx.execute(sql`
    SELECT audit_append_cross_tenant_attempt(
      ${input.targetTenantId}::uuid,
      ${input.targetEntity}::text,
      ${input.targetId ?? null}::uuid,
      ${input.actorIdentityId ?? null}::uuid,
      ${JSON.stringify(input.source)}::jsonb
    )
  `);
}
