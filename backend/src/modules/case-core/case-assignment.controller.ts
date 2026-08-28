/**
 * T052 — the case team surface. contracts/case-api.md §5-§6.
 *
 * Both routes declare `case.manage_team` (row 33, `assigned` scope) and
 * `@ScopeTarget('caseId')`.
 *
 * A consequence worth naming, because it looks like a bug and is not: a `CM` who is not on
 * a case cannot add themselves to it — the scope check refuses them before this controller
 * runs, with the same opaque 404 a nonexistent case gets. Staffing a matter you are not on
 * is an `MP`/`SA` act, and those two satisfy the resolver unconditionally (Decision 2).
 */
import { Body, Controller, Delete, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability, ScopeTarget } from '../../common/authz/declare';
import { assertUuid } from '../tenant/rfc';
import { CaseAssignmentService } from './case-assignment.service';

interface AuditableRequest {
  auditTargetId?: string | null;
}

export interface AssignmentItem {
  readonly caseId: string;
  readonly membershipId: string;
  readonly roleOnCase: string;
  readonly assignedAt: string;
  readonly unassignedAt?: string | null;
}

@Controller('tenant/cases/:caseId/team')
export class CaseAssignmentController {
  constructor(private readonly assignments: CaseAssignmentService) {}

  @Post()
  @HttpCode(201)
  @Capability('case.manage_team')
  @ScopeTarget('caseId')
  @Audited({ action: 'case.team_member_assigned', targetEntity: 'membership' })
  async assign(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<AssignmentItem> {
    const id = assertUuid(caseId, 'case id');
    const row = await this.assignments.assign(id, body);

    // The SUBJECT is the membership whose place on the matter changed, not the case —
    // matching 017's `directory.position_assigned`, which records the membership whose
    // position changed. The case is carried in metadata.
    //
    // Set after the call, so a refused assignment records nothing.
    req.auditTargetId = row.membershipId;
    addAuditMetadata(req as object, { caseId: id, roleOnCase: row.roleOnCase });

    return {
      caseId: row.caseId,
      membershipId: row.membershipId,
      roleOnCase: row.roleOnCase,
      assignedAt: row.assignedAt,
    };
  }

  /**
   * `DELETE` on the wire; an `UPDATE` in the database. It sets `unassigned_at` and deletes
   * nothing — there is no DELETE grant on `case_assignment` for any role (FR-012). The verb
   * describes the caller's intent, not the storage.
   *
   * The same action a revocation cascade writes (FR-012a, research.md D8): the event is
   * identical, and the actor plus the neighbouring `membership.revoked` entry are what
   * distinguish the two paths.
   */
  @Delete(':membershipId')
  @HttpCode(200)
  @Capability('case.manage_team')
  @ScopeTarget('caseId')
  @Audited({ action: 'case.team_member_unassigned', targetEntity: 'membership' })
  async unassign(
    @Param('caseId') caseId: string,
    @Param('membershipId') membershipId: string,
    @Req() req: AuditableRequest,
  ): Promise<AssignmentItem> {
    const id = assertUuid(caseId, 'case id');
    const member = assertUuid(membershipId, 'membership id');
    const row = await this.assignments.unassign(id, member);

    req.auditTargetId = row.membershipId;
    addAuditMetadata(req as object, { caseId: id });

    return {
      caseId: row.caseId,
      membershipId: row.membershipId,
      roleOnCase: row.roleOnCase,
      assignedAt: row.assignedAt,
      unassignedAt: row.unassignedAt,
    };
  }
}
