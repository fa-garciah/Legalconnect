/**
 * T048 — records a cross-tenant attempt against the TARGETED tenant.
 *
 * Opens its own transaction and sets no tenant, because it runs precisely when
 * activation failed. The definer function in 0007 is what makes the write possible:
 * it executes as lc_audit_writer, whose policy permits inserting exactly one action
 * and nothing else.
 *
 * The signature cannot express the actor's home tenant. That is the point (FR-023).
 */
import { appDb } from '../db/client';
import { appendCrossTenantAttempt } from '../audit/append';
import type { AuditSource } from '../db/schema';

export interface CrossTenantAttempt {
  readonly targetTenantId: string;
  readonly targetEntity: string;
  readonly targetId?: string | null;
  readonly actorIdentityId?: string | null;
  readonly source: AuditSource;
}

export async function recordCrossTenantAttempt(input: CrossTenantAttempt): Promise<void> {
  await appDb().transaction(async (tx) => {
    await appendCrossTenantAttempt(tx, {
      targetTenantId: input.targetTenantId,
      targetEntity: input.targetEntity,
      targetId: input.targetId ?? null,
      actorIdentityId: input.actorIdentityId ?? null,
      source: input.source,
    });
  });
}
