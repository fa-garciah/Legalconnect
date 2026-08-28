/**
 * contracts/tenant-invitations.md — revoke a membership, or change its
 * archetype. Two routes, not one with a body switch: `@Audited` metadata is
 * fixed per route (the same reason `plan.controller.ts` has two separate
 * `PATCH` routes rather than one with a discriminated body), and each of
 * these two writes a different action.
 *
 * `SA` for either operation; `MP` for revoke only — decided by
 * `AuthorizationInterceptor` against `matrix.ts` (004). Unchanged from what
 * 002 shipped (Decision 6).
 */
import { Body, Controller, HttpCode, Param, Patch, Req } from '@nestjs/common';
import { buildSource } from '../../common/audit/source';
import { firstHeaderValue } from '../../common/http/header';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { assertUuid } from '../tenant/rfc';
import { MembershipService, type MembershipRow } from './membership.service';

interface AuditableRequest {
  auditTargetId?: string | null;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
}

@Controller('tenant/memberships')
export class MembershipController {
  constructor(private readonly memberships: MembershipService) {}

  @Patch(':id/revoke')
  @HttpCode(200)
  @Capability('membership.revoke')
  @Audited({ action: 'membership.revoked', targetEntity: 'membership' })
  async revoke(@Param('id') id: string, @Req() req: AuditableRequest): Promise<MembershipRow> {
    const membershipId = assertUuid(id, 'membership id');
    req.auditTargetId = membershipId;

    // 006/FR-012a. The cascade writes its own `case.team_member_unassigned` entries, one
    // per closed assignment (SC-005 — exactly one entry per mutation), so it needs the
    // same `source` this route's own `@Audited` entry will carry. Built here because the
    // request is here; the service has no access to headers.
    const source = buildSource({
      channel: firstHeaderValue(req.headers, 'x-channel'),
      userAgent: firstHeaderValue(req.headers, 'user-agent'),
      ip: req.ip,
    });

    const { row, closedAssignmentCaseIds } = await this.memberships.revoke(membershipId, source);

    // A count, not the ids: those are already on the cascade's own entries, one each, and
    // repeating them here would duplicate the trail rather than add to it. The count is
    // what makes `membership.revoked` self-explanatory when read alone — "this revocation
    // also took them off 3 matters".
    if (closedAssignmentCaseIds.length > 0) {
      addAuditMetadata(req as object, { closedCaseAssignments: closedAssignmentCaseIds.length });
    }

    // The wire shape is unchanged from what 002 shipped — the cascade is a side effect the
    // caller neither asked for nor needs to see.
    return row;
  }

  @Patch(':id/archetype')
  @HttpCode(200)
  @Capability('membership.change_archetype')
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
