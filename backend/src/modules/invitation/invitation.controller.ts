/**
 * contracts/tenant-invitations.md — issue, revoke, list. Tenant surface;
 * `@Capability` is decided by `AuthorizationInterceptor` against `matrix.ts`
 * (see common/authz/interceptor.ts).
 */
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Audited } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
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
  @Capability('invitation.issue')
  @Audited({ action: 'invitation.issued', targetEntity: 'invitation' })
  async issue(
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<InvitationRow & { readonly invitationLink: string }> {
    const input = (body ?? {}) as Record<string, unknown>;
    const { row, rawReferenceToken } = await this.invitations.issue(input);
    req.auditTargetId = row.id;
    /*
     * 014-admin-ui, Decision 3 (approved 2026-09-23). The raw token used to be discarded here,
     * on the expectation that a transactional email would carry it (research.md D7). No email
     * provider exists — the AWS account is blocked — so no invitation could ever reach its
     * invitee. The issuer now receives the link once and delivers it themselves.
     *
     * It goes into THIS response only: not into `InvitationRow` (which `GET` returns), not into
     * the audit metadata, not into any log line. The service inserts a real invitation for every
     * email, including one that already holds a live membership, so the link is returned
     * identically in both cases and 002/FR-029's enumeration resistance holds. Do not add a
     * branch that omits or fakes it for existing members.
     */
    return { ...row, invitationLink: `/aceptar/${rawReferenceToken}` };
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @Capability('invitation.revoke')
  @Audited({ action: 'invitation.revoked', targetEntity: 'invitation' })
  async revoke(@Param('id') id: string, @Req() req: AuditableRequest): Promise<InvitationRow> {
    const invitationId = assertUuid(id, 'invitation id');
    const row = await this.invitations.revoke(invitationId);
    req.auditTargetId = row.id;
    return row;
  }

  @Get()
  @Capability('invitation.read_pending')
  async list(): Promise<{ items: readonly InvitationRow[] }> {
    return { items: await this.invitations.listPending() };
  }
}
