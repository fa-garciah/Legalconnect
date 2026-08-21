/**
 * T047 — what each refusal returns, and which ones write to the audit log.
 */
import type { HttpException } from '@nestjs/common';
import { REFUSALS_THAT_AUDIT, type RefusalReason } from './principal';
import { MfaEnrollmentRequired, ResourceNotFound, ValidationFailed } from '../http/errors';

/**
 * Only the two membership refusals audit.
 *
 * A deactivated tenant deliberately does not: writing to its log on every stray
 * request would turn its own audit volume into a denial-of-service surface. Nor do the
 * malformed-request refusals — otherwise anyone could inflate a tenant's log from
 * outside by sending headers.
 */
export function shouldAudit(reason: RefusalReason): boolean {
  return REFUSALS_THAT_AUDIT.has(reason);
}

/**
 * Every refusal that concerns a tenant answers 404 — including a deactivated one.
 *
 * That last case is the non-obvious one. A distinctive status for "deactivated" would
 * confirm to a caller that the tenant exists, which is the disclosure FR-008 exists to
 * prevent. Only malformed requests, which reveal nothing about any tenant, answer
 * differently.
 *
 * `mfa_not_enrolled` (slice 002, research.md D5) is the other deliberate
 * exception, in the opposite direction: it answers `403`, not `404`, because
 * reaching this branch already proves the caller holds a genuine, live,
 * resolved membership. There is no tenant-existence question left to protect —
 * telling them to finish enrollment discloses nothing they do not already
 * legitimately know.
 */
export function refusalToHttp(reason: RefusalReason): HttpException {
  switch (reason) {
    case 'no_identity':
      return new ValidationFailed('No authenticated identity was supplied.');
    case 'no_tenant_named':
      return new ValidationFailed('No tenant was named for this request.');
    case 'no_live_membership':
    case 'membership_revoked':
    case 'tenant_deactivated':
      return new ResourceNotFound();
    case 'mfa_not_enrolled':
      return new MfaEnrollmentRequired();
  }
}
