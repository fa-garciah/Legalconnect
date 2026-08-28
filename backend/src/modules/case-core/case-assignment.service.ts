/**
 * T051 — the case team's rules. 006/FR-009 to FR-012.
 *
 * Small on purpose. The interesting behaviour of this entity is not here — it is in
 * `assigned-scope.resolver.ts`, which reads what this service writes, and in the absence
 * of any cache between them (FR-011). This file only validates and maps refusals.
 */
import { Injectable } from '@nestjs/common';
import {
  AlreadyAssigned,
  MembershipNotAvailable,
  NotAssigned,
  ResourceNotFound,
  ValidationFailed,
} from '../../common/http/errors';
import { CaseRepository } from './case.repository';
import {
  CaseAssignmentRepository,
  type AssignmentRow,
  type CaseRoleOnCase,
} from './case-assignment.repository';

const ROLES = ['lead', 'collaborator', 'support'] as const;

const UNIQUE_VIOLATION = '23505';

function sqlstateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Descriptive, not authorizing. No capability in the matrix distinguishes a `lead` from a
 * `support` — being assigned at all is what grants scope, at any role (spec.md
 * Assumptions). A later slice needing "only the lead may X" declares that then; building
 * it now would be speculative.
 */
export function assertRoleOnCase(raw: unknown): CaseRoleOnCase {
  if (typeof raw !== 'string' || !(ROLES as readonly string[]).includes(raw)) {
    throw new ValidationFailed('roleOnCase must be lead, collaborator or support.');
  }
  return raw as CaseRoleOnCase;
}

function assertMembershipId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ValidationFailed('membershipId is required.');
  }
  return raw.trim();
}

@Injectable()
export class CaseAssignmentService {
  constructor(
    private readonly assignments: CaseAssignmentRepository,
    private readonly cases: CaseRepository,
  ) {}

  async assign(caseId: string, body: unknown): Promise<AssignmentRow> {
    const input = (body ?? {}) as { membershipId?: unknown; roleOnCase?: unknown };
    const membershipId = assertMembershipId(input.membershipId);
    const roleOnCase = assertRoleOnCase(input.roleOnCase);

    // The scope resolver has already decided the caller may manage this team, so a missing
    // case here means it genuinely does not exist. Same generic not-found.
    const target = await this.cases.findById(caseId);
    if (!target) throw new ResourceNotFound();

    // FR-010 — one refusal for revoked, foreign and absent. Assigning a revoked membership
    // would create a live row that FR-012a's cascade has already passed by, leaving
    // someone on a team who cannot reach it.
    const membership = await this.assignments.findLiveMembership(membershipId);
    if (!membership) throw new MembershipNotAvailable();

    try {
      return await this.assignments.insert(caseId, membershipId, roleOnCase);
    } catch (error) {
      // From the partial unique index, not a pre-check: two concurrent callers assigning
      // the same person would both read "not assigned" and both succeed.
      if (sqlstateOf(error) === UNIQUE_VIOLATION) throw new AlreadyAssigned();
      throw error;
    }
  }

  /**
   * FR-011's immediacy is this method's whole point. There is nothing to invalidate — the
   * resolver queries inside each request's own transaction, so the moment this `UPDATE`
   * commits, the next request from that member is refused. No cache, no grace period, no
   * session state carried over.
   */
  async unassign(caseId: string, membershipId: string): Promise<AssignmentRow> {
    const target = await this.cases.findById(caseId);
    if (!target) throw new ResourceNotFound();

    const row = await this.assignments.unassign(caseId, membershipId);
    // Covers both "never assigned" and "lost a race with a concurrent unassignment" — the
    // state is the same either way, and so is the refusal.
    if (!row) throw new NotAssigned();
    return row;
  }
}
