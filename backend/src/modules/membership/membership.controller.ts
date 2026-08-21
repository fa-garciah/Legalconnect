/**
 * contracts/tenant-invitations.md — revoke a membership, or change its
 * archetype. Two routes, not one with a body switch: `@Audited` metadata is
 * fixed per route (the same reason `plan.controller.ts` has two separate
 * `PATCH` routes rather than one with a discriminated body), and each of
 * these two writes a different action.
 *
 * `SA` for either operation; `MP` for revoke only — archetype change is
 * reserved to `SA` until slice 004 settles the global matrix (plan.md's note
 * on this).
 */
import { Body, Controller, HttpCode, Param, Patch, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { RequireArchetypes } from '../../common/permissions/guard';
import { assertUuid } from '../tenant/rfc';
import { MembershipService, type MembershipRow } from './membership.service';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@Controller('tenant/memberships')
export class MembershipController {
  constructor(private readonly memberships: MembershipService) {}

  @Patch(':id/revoke')
  @HttpCode(200)
  @RequireArchetypes('SA', 'MP')
  @Audited({ action: 'membership.revoked', targetEntity: 'membership' })
  async revoke(@Param('id') id: string, @Req() req: AuditableRequest): Promise<MembershipRow> {
    const membershipId = assertUuid(id, 'membership id');
    req.auditTargetId = membershipId;
    return this.memberships.revoke(membershipId);
  }

  @Patch(':id/archetype')
  @HttpCode(200)
  @RequireArchetypes('SA')
  @Audited({ action: 'membership.archetype_changed', targetEntity: 'membership' })
  async changeArchetype(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<MembershipRow> {
    const membershipId = assertUuid(id, 'membership id');
    const input = (body ?? {}) as { archetype?: unknown };
    req.auditTargetId = membershipId;
    const { row, previousArchetype } = await this.memberships.changeArchetype(
      membershipId,
      input.archetype,
    );
    addAuditMetadata(req as object, { from: previousArchetype, to: row.archetype });
    return row;
  }
}
