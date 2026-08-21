/**
 * contracts/tenant-invitations.md — issue, revoke, list. Tenant surface;
 * `@RequireArchetypes` is enforced by `TenantContextInterceptor`, not a Guard
 * (see common/permissions/guard.ts).
 */
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Audited } from '../../common/audit/interceptor';
import { RequireArchetypes } from '../../common/permissions/guard';
import { assertUuid } from '../tenant/rfc';
import { InvitationService, type InvitationRow } from './invitation.service';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@Controller('tenant/invitations')
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @HttpCode(201)
  @RequireArchetypes('SA', 'MP')
  @Audited({ action: 'invitation.issued', targetEntity: 'invitation' })
  async issue(
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<InvitationRow> {
    const input = (body ?? {}) as Record<string, unknown>;
    // The message is composed and would be handed to the transactional email
    // provider here (research.md D7) — actually dispatching it is an infra
    // concern for `/speckit-implement`'s follow-up, not this slice's tests.
    const { row } = await this.invitations.issue(input);
    req.auditTargetId = row.id;
    return row;
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequireArchetypes('SA', 'MP')
  @Audited({ action: 'invitation.revoked', targetEntity: 'invitation' })
  async revoke(@Param('id') id: string, @Req() req: AuditableRequest): Promise<InvitationRow> {
    const invitationId = assertUuid(id, 'invitation id');
    const row = await this.invitations.revoke(invitationId);
    req.auditTargetId = row.id;
    return row;
  }

  @Get()
  @RequireArchetypes('SA', 'MP')
  async list(): Promise<{ items: readonly InvitationRow[] }> {
    return { items: await this.invitations.listPending() };
  }
}
