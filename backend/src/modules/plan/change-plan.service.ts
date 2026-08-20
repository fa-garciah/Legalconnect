/**
 * T099 — the tier change service. FR-004: a tenant's plan changes with no
 * deployment. US5 scenario 4: a target tier whose limits are below the tenant's
 * CURRENT plan is reported before being confirmed.
 *
 * "Current consumption" in the contract's `exceeded` body means the CURRENT
 * plan's own ceilings here, not measured business usage — this slice owns no
 * business tables to measure against (modules/plan/README.md). "You are on a tier
 * that allows 100 users; the tier you are choosing allows 10" is the honest,
 * checkable statement this slice can make without inventing usage data it does not
 * own. Real consumption enforcement is slice 004's job.
 */
import { Injectable } from '@nestjs/common';
import { LimitsExceeded, ResourceNotFound, SamePlan } from '../../common/http/errors';
import { currentPlatformTx } from '../../common/db/platform-context';
import { normalisePlanCode } from '../tenant/rfc';
import { TenantRepository, type TenantRow } from '../tenant/tenant.repository';
import { PlanRepository, type PlanRow } from './plan.repository';

interface RawInput {
  readonly planCode?: unknown;
  readonly acknowledgeExceededLimits?: unknown;
}

export interface PlanChangeResult {
  readonly tenant: TenantRow;
  readonly previousPlanCode: string;
}

function exceededLimits(
  current: PlanRow['limits'],
  target: PlanRow['limits'],
): ReadonlyArray<{ limit: string; current: number; target: number }> {
  const exceeded: Array<{ limit: string; current: number; target: number }> = [];
  for (const key of Object.keys(target) as Array<keyof typeof target>) {
    const currentValue = current[key];
    const targetValue = target[key];
    if (typeof currentValue === 'number' && typeof targetValue === 'number' && targetValue < currentValue) {
      exceeded.push({ limit: String(key), current: currentValue, target: targetValue });
    }
  }
  return exceeded;
}

@Injectable()
export class ChangePlanService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly plans: PlanRepository,
  ) {}

  async change(tenantId: string, input: RawInput): Promise<PlanChangeResult> {
    const targetCode = normalisePlanCode(input.planCode);
    const acknowledged = input.acknowledgeExceededLimits === true;
    const tx = currentPlatformTx();

    const tenant = await this.tenants.findById(tx, tenantId);
    if (!tenant) throw new ResourceNotFound();

    if (tenant.planCode === targetCode) throw new SamePlan();

    const [currentPlan, targetPlan] = await Promise.all([
      this.plans.findByCode(tx, tenant.planCode),
      this.plans.findByCode(tx, targetCode),
    ]);
    if (!currentPlan || !targetPlan) throw new ResourceNotFound();

    if (!acknowledged) {
      const exceeded = exceededLimits(currentPlan.limits, targetPlan.limits);
      if (exceeded.length > 0) throw new LimitsExceeded(exceeded);
    }

    const updated = await this.tenants.changePlan(tx, tenantId, targetPlan.id);
    if (!updated) throw new ResourceNotFound();

    return { tenant: updated, previousPlanCode: tenant.planCode };
  }
}
