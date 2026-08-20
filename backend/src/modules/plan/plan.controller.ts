/**
 * T101 — the plan surface: changing a tenant's tier and configuring a tier's
 * limits. Both routes sit under the platform administration surface (FR-009):
 * assigning and reconfiguring plans legitimately spans tenants (every tenant on a
 * reconfigured tier), which no tenant session may do.
 */
import { Body, Controller, Param, Patch, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { PlatformSurface } from '../../common/permissions/guard';
import { assertUuid } from '../tenant/rfc';
import { ChangePlanService } from './change-plan.service';
import { ConfigureLimitsService } from './configure-limits.service';
import type { TenantRow } from '../tenant/tenant.repository';
import type { PlanRow } from './plan.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@PlatformSurface()
@Controller('internal/platform')
export class PlanController {
  constructor(
    private readonly changePlan: ChangePlanService,
    private readonly configureLimits: ConfigureLimitsService,
  ) {}

  @Patch('tenants/:tenantId/plan')
  @Audited({ action: 'tenant.plan_changed', targetEntity: 'tenant', platform: true })
  async change(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<TenantRow> {
    const id = assertUuid(tenantId, 'tenant id');
    req.auditTargetId = id;

    const { tenant, previousPlanCode } = await this.changePlan.change(id, (body ?? {}) as Record<string, unknown>);
    addAuditMetadata(req as object, { from: previousPlanCode, to: tenant.planCode });
    return tenant;
  }

  @Patch('plans/:planCode/limits')
  @Audited({ action: 'plan.limits_changed', targetEntity: 'plan', platform: true, tenantOptional: true })
  async configureLimitsFor(
    @Param('planCode') planCode: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<PlanRow> {
    const updated = await this.configureLimits.configure(planCode, (body ?? {}) as Record<string, unknown>);
    // Sets target_id (the plan), not the tenant attribution — see AuditedOptions.tenantOptional.
    req.auditTargetId = updated.id;
    addAuditMetadata(req as object, { to: updated.limits });
    return updated;
  }
}
