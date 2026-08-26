/**
 * T009 — the refusal vocabulary: the four ordered reasons, the `Decision` shape, and
 * their HTTP mapping. Normative for every slice downstream — contracts/refusal.md.
 */
import { HttpException } from '@nestjs/common';
import { EntitlementRequired, LimitReached, MfaEnrollmentRequired, NotAuthorized, ResourceNotFound } from '../http/errors';
import type { CapabilityId, ScopeKind } from './capability';

export type RefusalClass = 'mfa_not_enrolled' | 'permission' | 'scope' | 'entitlement';

/**
 * Exactly one reason is ever returned, always the earliest that applies (FR-022).
 * `mfa_not_enrolled` is enforced upstream by `resolvePrincipal` and is not re-checked
 * by `decide()` in production — it is named here so this constant, and
 * `refusal-ordering.test.ts`, are complete (contracts/refusal.md §1).
 */
export const REFUSAL_ORDER: readonly RefusalClass[] = [
  'mfa_not_enrolled',
  'permission',
  'scope',
  'entitlement',
];

export type Decision =
  | { readonly permitted: true }
  | {
      readonly permitted: false;
      readonly reason: RefusalClass;
      /** Populated only for `entitlement` from a quantitative limit. FR-024. */
      readonly limit?: { readonly key: string; readonly value: number };
      /** Populated only for `entitlement` from a feature flag. */
      readonly capability?: CapabilityId;
    };

/**
 * research.md D6. `assigned` is provisional: no capability in this slice's registry
 * resolves at that kind, so this status is never reached today. Kept behind one named
 * constant so Open Item 3 (403 vs 404, pending the professional-privilege sign-off) is
 * a one-line change when the clients-and-cases slice ships the first `assigned`
 * capability.
 */
const ASSIGNED_SCOPE_REFUSAL = () => new ResourceNotFound();

/**
 * The wire mapping of contracts/refusal.md §2. `scopeKind` disambiguates a `scope`
 * refusal — `self` answers like `permission` (403, nothing disclosed); `assigned`
 * answers via the provisional constant above. Every other reason needs no scope kind.
 */
export function refusalToHttp(
  decision: Extract<Decision, { readonly permitted: false }>,
  scopeKind?: ScopeKind,
): HttpException {
  switch (decision.reason) {
    case 'mfa_not_enrolled':
      return new MfaEnrollmentRequired();
    case 'permission':
      return new NotAuthorized();
    case 'scope':
      return scopeKind === 'assigned' ? ASSIGNED_SCOPE_REFUSAL() : new NotAuthorized();
    case 'entitlement':
      return decision.limit
        ? new LimitReached(decision.limit)
        : new EntitlementRequired(decision.capability as CapabilityId);
  }
}
