/**
 * T072 — tenant reads and writes against the platform client.
 *
 * Every method takes the active platform transaction rather than reaching for a
 * connection itself, so the audit append and the mutation cannot end up in different
 * transactions (FR-017).
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PlatformTx } from '../../common/db/platform-context';

export interface TenantRow {
  readonly id: string;
  readonly name: string;
  readonly rfc: string;
  readonly planCode: string;
  readonly status: 'active' | 'deactivated';
  readonly createdAt: string;
  readonly deactivatedAt: string | null;
  /** Drizzle's `execute<T>` constrains T to Record<string, unknown>. */
  readonly [key: string]: unknown;
}

/** PostgreSQL unique-violation. Mapped by the caller, never swallowed here. */
export const UNIQUE_VIOLATION = '23505';

@Injectable()
export class TenantRepository {
  async insert(
    tx: PlatformTx,
    input: { name: string; rfc: string; planCode: string },
  ): Promise<TenantRow> {
    const result = await tx.execute<TenantRow>(sql`
      INSERT INTO tenant (name, rfc, plan_id)
      VALUES (
        ${input.name},
        ${input.rfc},
        (SELECT id FROM plan WHERE code = ${input.planCode}::plan_code)
      )
      RETURNING id,
                name,
                rfc,
                ${input.planCode}::text AS "planCode",
                status,
                created_at::text  AS "createdAt",
                deactivated_at::text AS "deactivatedAt"
    `);
    return result.rows[0]!;
  }

  async findById(tx: PlatformTx, id: string): Promise<TenantRow | null> {
    const result = await tx.execute<TenantRow>(sql`
      SELECT t.id,
             t.name,
             t.rfc,
             p.code::text        AS "planCode",
             t.status,
             t.created_at::text  AS "createdAt",
             t.deactivated_at::text AS "deactivatedAt"
        FROM tenant t
        JOIN plan p ON p.id = t.plan_id
       WHERE t.id = ${id}::uuid
    `);
    return result.rows[0] ?? null;
  }

  /**
   * Moves active → deactivated, and only from active.
   *
   * The `status = 'active'` predicate is what makes a second call a no-op at the data
   * layer instead of relying on the service having read first: two concurrent
   * deactivations cannot both report success.
   */
  async deactivate(tx: PlatformTx, id: string): Promise<TenantRow | null> {
    const result = await tx.execute<TenantRow>(sql`
      UPDATE tenant
         SET status = 'deactivated', deactivated_at = now()
       WHERE id = ${id}::uuid AND status = 'active'
      RETURNING id,
                name,
                rfc,
                (SELECT code::text FROM plan WHERE plan.id = tenant.plan_id) AS "planCode",
                status,
                created_at::text  AS "createdAt",
                deactivated_at::text AS "deactivatedAt"
    `);
    return result.rows[0] ?? null;
  }
}
