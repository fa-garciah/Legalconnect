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

export class NotAuthorized extends HttpException {
  constructor() {
    super(
      errorBody('not_authorized', 'Your role does not permit this operation.'),
      HttpStatus.FORBIDDEN,
    );
  }
}

export class SamePlan extends HttpException {
  constructor() {
    super(errorBody('same_plan', 'The tenant is already on that plan.'), HttpStatus.UNPROCESSABLE_ENTITY);
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
