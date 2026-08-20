/**
 * T076 / T077 — the platform administration surface.
 *
 * Every route carries `@PlatformSurface()`, which is what exempts it from the tenant
 * middleware and the membership guard. The exemption is an explicit, reviewable
 * declaration in the source rather than a silent property of the path — which is the
 * shape the constitution asks for: the mechanism applies by default and opting out is
 * visible.
 *
 * NOT network-exposed in this slice. It authenticates nothing, so an exposed instance
 * would perform unauthenticated tenant creation. main.ts binds to loopback.
 */
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Audited } from '../../common/audit/interceptor';
import { PlatformSurface } from '../../common/permissions/guard';
import { currentPlatformTx } from '../../common/db/platform-context';
import { ResourceNotFound } from '../../common/http/errors';
import { ProvisionService } from './provision.service';
import { DeactivateService } from './deactivate.service';
import { TenantRepository, type TenantRow } from './tenant.repository';
import { assertUuid } from './rfc';

/** The interceptor reads `auditTargetId` to decide which tenant the entry belongs to. */
interface AuditableRequest {
  auditTargetId?: string | null;
}

@PlatformSurface()
@Controller('internal/platform/tenants')
export class PlatformTenantController {
  constructor(
    private readonly provisioning: ProvisionService,
    private readonly deactivation: DeactivateService,
    private readonly tenants: TenantRepository,
  ) {}

  @Post()
  @HttpCode(201)
  @Audited({ action: 'tenant.provisioned', targetEntity: 'tenant', platform: true })
  async provision(@Body() body: unknown, @Req() req: AuditableRequest): Promise<TenantRow> {
    const created = await this.provisioning.provision((body ?? {}) as Record<string, unknown>);
    // Set before the interceptor appends, so the entry lands in the NEW tenant's log.
    req.auditTargetId = created.id;
    return created;
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Audited({ action: 'tenant.deactivated', targetEntity: 'tenant', platform: true })
  async deactivate(@Param('id') id: string, @Req() req: AuditableRequest): Promise<TenantRow> {
    const tenantId = assertUuid(id, 'tenant id');
    // Assigned before the call so that a refusal (404/409) throws before the append —
    // a deactivation that did not happen must not appear in the log.
    req.auditTargetId = tenantId;
    return this.deactivation.deactivate(tenantId);
  }

  /**
   * T077 — the registry read. Channel-gated (FR-026): the entry is written only for an
   * interactive read, so monitoring cannot grow the log it is watching. The gate itself
   * lives in appendAuditEntry, keyed off `source.channel`; this route simply declares
   * the action and lets the mechanism decide.
   */
  @Get(':id')
  @Audited({ action: 'tenant.registry_read', targetEntity: 'tenant', platform: true })
  async read(@Param('id') id: string, @Req() req: AuditableRequest): Promise<TenantRow> {
    const tenantId = assertUuid(id, 'tenant id');
    const found = await this.tenants.findById(currentPlatformTx(), tenantId);
    // Throws before auditTargetId is set, so a miss records nothing.
    if (!found) throw new ResourceNotFound();
    req.auditTargetId = tenantId;
    return found;
  }
}
