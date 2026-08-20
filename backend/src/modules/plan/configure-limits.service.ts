/**
 * T100 — plan limits (and, in future, entitlements) configuration. FR-016: takes
 * effect with no deployment, because it is a row update rather than a code change.
 */
import { Injectable } from '@nestjs/common';
import { ResourceNotFound, ValidationFailed } from '../../common/http/errors';
import { currentPlatformTx } from '../../common/db/platform-context';
import { PlanRepository, type PlanRow } from './plan.repository';
import type { PlanLimits } from '../../common/db/schema';

interface RawInput {
  readonly limits?: unknown;
}

const LIMIT_KEYS = ['users', 'storageBytes', 'monthlyCfdi'] as const;

function normaliseLimits(raw: unknown): PlanLimits {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationFailed('limits must be an object.');
  }
  const input = raw as Record<string, unknown>;
  const limits: Record<string, number> = {};
  for (const key of LIMIT_KEYS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new ValidationFailed(`${key} must be a non-negative integer.`);
    }
    limits[key] = value;
  }
  return limits as PlanLimits;
}

@Injectable()
export class ConfigureLimitsService {
  constructor(private readonly plans: PlanRepository) {}

  async configure(code: string, input: RawInput): Promise<PlanRow> {
    const limits = normaliseLimits(input.limits);
    const updated = await this.plans.updateLimits(currentPlatformTx(), code, limits);
    if (!updated) throw new ResourceNotFound();
    return updated;
  }
}
