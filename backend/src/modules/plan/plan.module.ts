import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PlanController } from './plan.controller';
import { PlanRepository } from './plan.repository';
import { ChangePlanService } from './change-plan.service';
import { ConfigureLimitsService } from './configure-limits.service';

/**
 * Tier assignment and limit configuration (US5). Imports TenantModule for
 * TenantRepository — changing a tenant's plan reads and writes the tenant row, and
 * that repository already exists rather than being duplicated here.
 */
@Module({
  imports: [TenantModule],
  controllers: [PlanController],
  providers: [PlanRepository, ChangePlanService, ConfigureLimitsService],
})
export class PlanModule {}
