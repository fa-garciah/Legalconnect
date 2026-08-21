import { Module } from '@nestjs/common';
import { PlatformTenantController } from './platform.controller';
import { ProvisionService } from './provision.service';
import { DeactivateService } from './deactivate.service';
import { TenantRepository } from './tenant.repository';
import { SeedAdministratorController } from './seed.controller';
import { SeedAdministratorService } from './seed.service';

/**
 * Tenant provisioning, deactivation and registry reads.
 *
 * Everything here belongs to the platform administration surface (FR-009). There is
 * deliberately no tenant-facing controller in this module: nothing in this slice lets a
 * firm read or change its own tenant record, because `spec.md` gives that capability to
 * no archetype.
 */
@Module({
  controllers: [PlatformTenantController, SeedAdministratorController],
  providers: [TenantRepository, ProvisionService, DeactivateService, SeedAdministratorService],
  exports: [TenantRepository],
})
export class TenantModule {}
