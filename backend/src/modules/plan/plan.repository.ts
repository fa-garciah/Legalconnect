/**
 * T098 — plan reads and writes against the platform client. FR-004, FR-016: tier
 * assignment and limit configuration take effect with no deployment, which this
 * repository delivers by being nothing more than a row read and a row update.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PlatformTx } from '../../common/db/platform-context';
import type { PlanLimits } from '../../common/db/schema';

export interface PlanRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly limits: PlanLimits;
  readonly entitlements: Record<string, boolean>;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
}

@Injectable()
export class PlanRepository {
  /**
   * Compares `code` as TEXT rather than casting the input to the `plan_code` enum.
   * Casting an unrecognised string to the enum raises a Postgres error before any
   * row lookup happens, which would surface an unknown code as a 500 rather than
   * the plain "no such row" this method is meant to express.
   */
  async findByCode(tx: PlatformTx, code: string): Promise<PlanRow | null> {
    const result = await tx.execute<PlanRow>(sql`
      SELECT id, code::text AS code, name, limits, entitlements, updated_at::text AS "updatedAt"
        FROM plan
       WHERE code::text = ${code}
    `);
    return result.rows[0] ?? null;
  }

  async updateLimits(tx: PlatformTx, code: string, limits: PlanLimits): Promise<PlanRow | null> {
    const result = await tx.execute<PlanRow>(sql`
      UPDATE plan
         SET limits = ${JSON.stringify(limits)}::jsonb, updated_at = now()
       WHERE code::text = ${code}
      RETURNING id, code::text AS code, name, limits, entitlements, updated_at::text AS "updatedAt"
    `);
    return result.rows[0] ?? null;
  }
}
