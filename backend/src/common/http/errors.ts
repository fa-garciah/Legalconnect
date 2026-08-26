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
