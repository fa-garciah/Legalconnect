/**
 * The shared error body, and the one response rule that carries a principle.
 *
 * Any attempt to reach another tenant's resource answers 404 with a body identical to
 * a resource that genuinely does not exist. Never 403 — that would confirm existence.
 * FR-008, AS-02. The constitution states it as "404/403, never 200"; this slice picks
 * 404 because 403 still discloses.
 */
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';

export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export const errorBody = (code: string, message: string): ErrorBody => ({
  error: { code, message },
});

/**
 * The single generic not-found response. Deliberately takes no arguments describing
 * what was looked for: a caller must not be able to tell a foreign resource from an
 * absent one by comparing messages.
 */
export class ResourceNotFound extends NotFoundException {
  constructor() {
    super(errorBody('not_found', 'The requested resource does not exist.'));
  }
}

export class ValidationFailed extends HttpException {
  constructor(message = 'The request could not be validated.') {
    super(errorBody('validation_failed', message), HttpStatus.BAD_REQUEST);
  }
}

export class RfcAlreadyRegistered extends HttpException {
  constructor() {
    super(
      errorBody('rfc_already_registered', 'A tenant with that RFC already exists.'),
      HttpStatus.CONFLICT,
    );
  }
}

export class AlreadyDeactivated extends HttpException {
  constructor() {
    super(errorBody('already_deactivated', 'The tenant is already deactivated.'), HttpStatus.CONFLICT);
  }
}

export class AlreadyRevoked extends HttpException {
  constructor() {
    super(errorBody('already_revoked', 'The membership is already revoked.'), HttpStatus.CONFLICT);
  }
}

/**
 * FR-035 (slice 002). Unlike most refusals in this system, this one names a
 * specific, informative cause deliberately: the caller is the platform
 * operator, who already knows the tenant's full state through the platform
 * registry read — this discloses nothing FR-028 protects anyone from
 * (research.md, contracts/platform-seed.md).
 */
export class TenantAlreadyHasMembers extends HttpException {
  constructor() {
    super(
      errorBody('tenant_already_has_members', 'The tenant already has at least one live membership.'),
      HttpStatus.CONFLICT,
    );
  }
}

export class NotAuthorized extends HttpException {
  constructor() {
    super(
      errorBody('not_authorized', 'Your role does not permit this operation.'),
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * FR-026 (slice 002). Deliberately distinct from `NotAuthorized`: the caller's
 * archetype is fine and their membership is genuinely live — the one missing
 * precondition is second-factor enrollment, which is actionable information
 * for them, not a disclosure risk (research.md D5).
 */
export class MfaEnrollmentRequired extends HttpException {
  constructor() {
    super(
      errorBody('mfa_enrollment_required', 'Second-factor enrollment must be completed first.'),
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * FR-022/FR-034 (slice 002). The ONE refusal `POST /identity/invitations/{ref}/accept`
 * can ever return — no such reference, expired, used, revoked, email mismatch,
 * tenant deactivated, and attempt-threshold-exceeded all answer identically.
 * `400`, not `404`: there is no tenant-existence question to protect at this
 * boundary (the caller has no tenant context to probe), but FR-028's
 * email-enumeration question still applies, which is what the single generic
 * body protects regardless of status code.
 */
export class InvitationInvalid extends HttpException {
  constructor() {
    super(
      errorBody('invitation_invalid', 'This invitation cannot be accepted.'),
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * research.md D8 — the per-tenant issuance cap. Unlike `InvitationInvalid`,
 * the issuer here is already an authenticated SA/MP of the tenant, not an
 * outsider FR-028 needs to protect against, so there is no enumeration
 * rationale for hiding the reason.
 */
export class RateLimited extends HttpException {
  constructor() {
    super(
      errorBody('rate_limited', 'Too many invitations issued for this tenant recently.'),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class SamePlan extends HttpException {
  constructor() {
    super(errorBody('same_plan', 'The tenant is already on that plan.'), HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/**
 * FR-006 (004). Distinct from `NotAuthorized`: the caller's archetype holds this
 * capability, and their tenant's plan simply does not include it. The remedy is
 * commercial (upgrade), not a role change, so the two must not share a code.
 */
export class EntitlementRequired extends HttpException {
  constructor(capability: string) {
    super(
      { ...errorBody('entitlement_required', 'Your plan does not include this feature.'), capability },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * FR-024 (004). Names the limit reached — `value` is the plan's configured ceiling,
 * never the tenant's current usage (contracts/refusal.md §2).
 */
export class LimitReached extends HttpException {
  constructor(limit: { readonly key: string; readonly value: number }) {
    super(
      { ...errorBody('limit_reached', "Your plan's limit for this has been reached."), limit },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * FR-010 (004, research.md D5). A tenant may never be left with zero live `SA`
 * memberships. Distinct from `NotAuthorized`: the caller may well hold the
 * capability — the refusal is the invariant itself, not a role check.
 */
export class LastAdministratorProtected extends HttpException {
  constructor() {
    super(
      errorBody(
        'last_administrator_protected',
        'This tenant must always retain at least one live administrator.',
      ),
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * FR-010 (017). The one refusal this slice adds beyond 004's four reasons and
 * 001/002's existing ones: the caller's permission, scope, entitlement and tenant
 * are all fine — the position they named is simply not one of their own firm's.
 *
 * `422`, not `404`: the resource being written (the membership) exists and is
 * theirs; it is the request body that names something unusable. Deliberately the
 * SAME refusal for "no such position", "another tenant's position" and "a retired
 * position of my own catalog" — a caller must not be able to tell those three
 * apart from the response (contracts/directory-api.md §2).
 */
export class PositionNotInCatalog extends HttpException {
  constructor() {
    super(
      errorBody(
        'position_not_in_catalog',
        "That position is not available in this tenant's catalog.",
      ),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * research.md D6 (017). An ACTIVE position with this name already exists in the
 * caller's own catalog, compared case- and whitespace-insensitively.
 *
 * The functional unique index in `backend/drizzle/0020` is the backstop; this
 * refusal is the primary UX, the same division 001's RFC uniqueness already uses —
 * a friendly `409` beats a raw constraint-violation `500`. It names its cause
 * plainly: the caller is an MP/SA of this tenant reading this tenant's own catalog,
 * so there is nothing here they could not already see by listing it.
 */
export class PositionAlreadyExists extends HttpException {
  constructor() {
    super(
      errorBody(
        'position_already_exists',
        'An active position with that name already exists in this catalog.',
      ),
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * FR-007 (017). The same shape 001's `AlreadyDeactivated` and 002's `AlreadyRevoked`
 * already have: a mutation onto an already-final state is refused, not silently
 * accepted, so the audit log never gains a second retirement of one position.
 */
export class PositionAlreadyRetired extends HttpException {
  constructor() {
    super(errorBody('already_retired', 'The position is already retired.'), HttpStatus.CONFLICT);
  }
}

/* -------------------------------------------------------------------------
 * 006-client-case-core. Eleven refusals.
 *
 * None of these is reachable by a caller who failed authorization first: 004's refusal
 * ordering puts permission and scope ahead of every business refusal, so a 403 — or, for
 * an `assigned`-scope capability, an opaque 404 — is always returned before any of these
 * can fire. That ordering is exactly what lets them name their causes plainly without
 * leaking anything (contracts/case-api.md §8).
 * ---------------------------------------------------------------------- */

/**
 * FR-003. Deliberately NOT a reuse of `AlreadyDeactivated` above: that class's message
 * names tenants, it is correct for tenants, and rewording it would make 001's own
 * contract text wrong.
 */
export class ClientAlreadyDeactivated extends HttpException {
  constructor() {
    super(errorBody('already_deactivated', 'The client is already deactivated.'), HttpStatus.CONFLICT);
  }
}

/**
 * FR-004a. The mirror of the refusal above, and the reason restoration is a real
 * operation rather than a silent no-op: an idempotent-looking mutation onto a final state
 * is refused, so the audit trail never gains a restoration that restored nothing.
 */
export class ClientAlreadyActive extends HttpException {
  constructor() {
    super(errorBody('already_active', 'The client is already active.'), HttpStatus.CONFLICT);
  }
}

/**
 * FR-007. Names its cause plainly, on the same reasoning as `PositionAlreadyExists`: the
 * caller is a member of this tenant who could list its own cases anyway, so there is
 * nothing here they could not already see.
 *
 * Mapped from the DATABASE's unique violation, never from a prior existence check — a
 * read-then-write passes a sequential test and still lets two concurrent callers both
 * succeed, which is the argument `ProvisionService` already makes for tenant RFCs.
 */
export class FileNumberAlreadyUsed extends HttpException {
  constructor() {
    super(
      errorBody('file_number_already_used', 'A case with that file number already exists.'),
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * FR-004. Deliberately the SAME refusal for three distinct causes — the client is
 * inactive, belongs to another tenant, or does not exist — on `PositionNotInCatalog`'s
 * precedent. A caller must not be able to tell them apart from the response, because the
 * second of the three is a cross-tenant existence probe.
 *
 * `422`, not `404`: the operation being attempted (opening a case) is legitimate and the
 * caller's tenant is right; it is the request body that names something unusable.
 */
export class ClientNotAvailable extends HttpException {
  constructor() {
    super(
      errorBody('client_not_available', 'That client is not available for a new case.'),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * FR-005, FR-020. One refusal for retired / foreign / absent, and — unlike the client
 * case above — it also does not say WHICH of the three ids (status, matter type, venue)
 * was the problem. Naming the field would turn one probe into three.
 */
export class CatalogEntryNotAvailable extends HttpException {
  constructor() {
    super(
      errorBody(
        'catalog_entry_not_available',
        'One of the catalog entries named is not available in this tenant.',
      ),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** FR-009, FR-010. One refusal for revoked / foreign / absent, same reasoning. */
export class MembershipNotAvailable extends HttpException {
  constructor() {
    super(
      errorBody('membership_not_available', 'That member is not available for assignment.'),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * FR-009. Backed by the `case_assignment_live_unique` partial index, which is what makes
 * this correct under concurrency rather than merely correct in sequence.
 */
export class AlreadyAssigned extends HttpException {
  constructor() {
    super(
      errorBody('already_assigned', 'That member is already assigned to this case.'),
      HttpStatus.CONFLICT,
    );
  }
}

/** FR-012. Unassigning someone who is not on the case. */
export class NotAssigned extends HttpException {
  constructor() {
    super(
      errorBody('not_assigned', 'That member is not assigned to this case.'),
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Refused rather than silently accepted, so the audit log never gains a no-op status
 * change. Distinct from 001's `SamePlan`, whose message names plans.
 */
export class SameStatus extends HttpException {
  constructor() {
    super(
      errorBody('same_status', 'The case already holds that status.'),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * FR-019. 017's `PositionAlreadyExists` for a different catalog — not reused, because its
 * message names positions and generalising it would make 017's contract text wrong.
 *
 * The partial unique index is the backstop; this is the primary path, the same division
 * 001's RFC uniqueness already uses. A name matching a RETIRED entry succeeds, which is
 * what makes retire-then-recreate legal (017's D4/D6, unchanged).
 */
export class CatalogEntryAlreadyExists extends HttpException {
  constructor() {
    super(
      errorBody(
        'catalog_entry_already_exists',
        'An active entry with that name already exists in this catalog.',
      ),
      HttpStatus.CONFLICT,
    );
  }
}

/** FR-020. The catalog analogue of `PositionAlreadyRetired`. */
export class CatalogEntryAlreadyRetired extends HttpException {
  constructor() {
    super(errorBody('already_retired', 'The catalog entry is already retired.'), HttpStatus.CONFLICT);
  }
}

/**
 * 007-document-management, FR-004. Same shape as `AlreadyDeactivated` (001),
 * `AlreadyRevoked` (002) and `PositionAlreadyRetired` (017) — idempotent-mutation-
 * on-an-already-final-state is refused, not silently accepted.
 */
export class AlreadyWithdrawn extends HttpException {
  constructor() {
    super(errorBody('already_withdrawn', 'The document is already withdrawn.'), HttpStatus.CONFLICT);
  }
}

/** 007-document-management. Restoring a document that was never withdrawn. */
export class NotWithdrawn extends HttpException {
  constructor() {
    super(errorBody('not_withdrawn', 'The document is not withdrawn.'), HttpStatus.CONFLICT);
  }
}

export class LimitsExceeded extends HttpException {
  constructor(exceeded: ReadonlyArray<{ limit: string; current: number; target: number }>) {
    super(
      {
        ...errorBody('limits_exceeded', 'Target plan limits are below current usage.'),
        exceeded,
      },
      HttpStatus.CONFLICT,
    );
  }
}
