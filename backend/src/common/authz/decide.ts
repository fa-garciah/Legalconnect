/**
 * T022 / T038 / T046 / T056 — the pure decision function. Walks `REFUSAL_ORDER` and
 * returns the first refusal reached, or `{ permitted: true }`. No database, no HTTP,
 * no tenant — everything it needs arrives on `DecisionInput`, which is what lets the
 * full matrix be enumerated rather than sampled (SC-001).
 */
import { capabilityDef, type CapabilityId } from './capability';
import { evaluateEntitlement, type Plan } from './entitlement';
import { MATRIX, type Subject } from './matrix';
import type { Decision } from './refusal';
import { resolverFor, type ScopeRequest } from './scope';
import type { PlanLimits } from '../db/schema';

export interface DecisionInput {
  readonly subject: Subject;
  /** `null` ⇒ the endpoint declared no capability. Refused before anything else (FR-019). */
  readonly capability: CapabilityId | null;
  readonly mfaEnrolledAt: string | null | undefined;
  readonly scope: ScopeRequest;
  readonly plan: Plan | null;
  readonly usage?: Readonly<Partial<Record<keyof PlanLimits, number>>>;
}

export async function decide(input: DecisionInput): Promise<Decision> {
  // Refused before any other evaluation — including reason 1 — because there is no
  // capability to evaluate anything else against.
  if (input.capability === null) {
    return { permitted: false, reason: 'permission' };
  }

  // Reason 1 (contracts/refusal.md §1) is enforced upstream by `resolvePrincipal`
  // before `AuthorizationInterceptor` ever runs, and is not re-checked in production.
  // It is checked here too so this pure function — and `refusal-ordering.test.ts` —
  // can assert all four reasons, and their ordering, in one place.
  if (input.mfaEnrolledAt === null) {
    return { permitted: false, reason: 'mfa_not_enrolled' };
  }

  const def = capabilityDef(input.capability);

  // research.md D8: rows 9-10 (`self` scope) are not archetype-decided by anybody —
  // the matrix is not consulted, and the scope step below is the whole constraint.
  // Every other scope kind is decided by the matrix first (research.md, plan.md Open
  // Item 2).
  if (def.scope !== 'self') {
    // Defensive, not reachable through real `CapabilityId` values: `MATRIX` is total
    // over that type, so this fallback only matters for an id that reached here via
    // an unsafe cast (deny-by-default.test.ts). Empty, never permissive.
    const subjects = MATRIX[input.capability] ?? new Set<Subject>();
    if (!subjects.has(input.subject)) {
      return { permitted: false, reason: 'permission' };
    }
  }

  // Fail-closed: an unregistered kind (`assigned`, today) refuses rather than
  // defaulting open (research.md D3, US5 scenario 6).
  const resolver = resolverFor(def.scope);
  if (!resolver) {
    return { permitted: false, reason: 'scope' };
  }
  const inScope = await resolver.resolve(input.scope);
  if (!inScope) {
    return { permitted: false, reason: 'scope' };
  }

  const entitlement = evaluateEntitlement(input.capability, def, input.plan, input.usage);
  if (!entitlement.permitted) return entitlement;

  return { permitted: true };
}
