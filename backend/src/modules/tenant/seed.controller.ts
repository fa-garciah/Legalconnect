/**
 * contracts/platform-seed.md — the one PO capability. Extends 001's existing
 * platform surface (`@PlatformSurface()`, base path `/internal/platform`)
 * rather than creating a new one.
 */
import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Audited } from '../../common/audit/interceptor';
import { PlatformSurface } from '../../common/permissions/guard';
import { Capability } from '../../common/authz/declare';
import { assertUuid } from './rfc';
import { SeedAdministratorService, type SeedInvitationRow } from './seed.service';

interface AuditableRequest {
  auditTargetId?: string | null;
  auditTenantId?: string | null;
}

@PlatformSurface()
@Controller('internal/platform/tenants')
export class SeedAdministratorController {
  constructor(private readonly seed: SeedAdministratorService) {}

  @Post(':tenantId/seed-administrator')
  @HttpCode(201)
  @Capability('invitation.issue_seed')
  // tenantOptional: true because the audited TARGET (the invitation) and the
  // audited TENANT (whose log it lands in, FR-033-style attribution) are two
  // different ids here — the same reason 001's plan.limits_changed uses this
  // flag, see common/audit/interceptor.ts.
  @Audited({
    action: 'invitation.seed_issued',
    targetEntity: 'invitation',
    platform: true,
    tenantOptional: true,
  })
  async seedAdministrator(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<SeedInvitationRow> {
    const id = assertUuid(tenantId, 'tenant id');
    const row = await this.seed.seed(id, (body ?? {}) as Record<string, unknown>);
    req.auditTargetId = row.id;
    req.auditTenantId = id;
    return row;
  }
}
