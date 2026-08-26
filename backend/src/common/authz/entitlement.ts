/**
 * T045 — `plan.entitlements` (feature flag) and `plan.limits` (quantitative ceiling)
 * evaluation. Both are `entitlement`-class refusals (FR-022); a capability declares at
 * most one of `tier`/`limit`, so the two shapes never compete (research.md D4).
 *
 * No cache, no TTL, no memoisation (research.md D7) — the plan arrives on
 * `ActivePrincipal` from the query `DbMembershipPort.find()` already runs, so there is
 * nothing here to invalidate.
 */
import type { PlanLimits } from '../db/schema';
import type { CapabilityDef, CapabilityId } from './capability';
import type { Decision } from './refusal';

export interface Plan {
  readonly entitlements: Record<string, boolean>;
  readonly limits: PlanLimits;
}

/**
 * `def` is taken separately from `capabilityId` rather than looked up against the
 * shared `CAPABILITIES` registry, so a test can exercise the limit/feature shape
 * against a synthetic definition without casting the real constant — no capability
 * carries a `tier` or `limit` key at launch (plan.md Open Item 4).
 */
export function evaluateEntitlement(
  capabilityId: CapabilityId,
  def: Pick<CapabilityDef, 'tier' | 'limit'>,
  plan: Plan | null,
  usage?: Readonly<Partial<Record<keyof PlanLimits, number>>>,
): Decision {
  if (def.tier) {
    // A `null` plan refuses any capability carrying a `tier` key — fail-closed.
    if (!plan || plan.entitlements[def.tier] !== true) {
      return { permitted: false, reason: 'entitlement', capability: capabilityId };
    }
  }

  if (def.limit) {
    if (!plan) return { permitted: false, reason: 'entitlement', capability: capabilityId };
    const ceiling = plan.limits[def.limit];
    if (ceiling !== undefined) {
      const used = usage?.[def.limit] ?? 0;
      if (used >= ceiling) {
        return { permitted: false, reason: 'entitlement', limit: { key: def.limit, value: ceiling } };
      }
    }
  }

  return { permitted: true };
}
