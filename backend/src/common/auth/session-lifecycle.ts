/**
 * T010 — the role-class module. research.md D3.
 *
 * NO NestJS OR DRIZZLE IMPORT. This must be loadable without a framework or a
 * container, the same discipline `capability.ts` already established for the
 * capability registry — it is what lets the exhaustive unit suite run with no
 * Testcontainers.
 *
 * `roleClassFor()` does NOT do a second archetype lookup of its own. The caller
 * (`AuthorizationInterceptor`) already has `caller.principal?.archetype` in scope,
 * read fresh from `membership` on every request with no cache
 * (`tenant/membership.ts`). This function only maps that already-resolved value —
 * or its absence — onto one of the three role classes the constitution's Sessions
 * section names.
 *
 * `null` (no active tenant context — an identity-only route, 004 D8's `self`-scope
 * rows) resolves to `'sa'`, the TIGHTEST of the three. This is a plan-level
 * default, not a spec-cited fact (plan.md Open Item 2): these routes are narrow and
 * low-risk by 004's own reasoning, so erring toward the shortest limits available
 * costs little and avoids inventing a fourth class for a two-route edge.
 *
 * What this deliberately does NOT do: resolve the theoretical case of an identity
 * holding live memberships of different classes in different tenants by taking "the
 * most restrictive held anywhere." The class is read from the tenant ACTUALLY being
 * acted in for this request — falling back to the tightest class only when there is
 * no tenant in play at all — in tension otherwise with FR-013's "access to a tenant
 * not deactivated is unaffected by a different tenant."
 */
import type { archetype } from '../db/schema';

type Archetype = (typeof archetype.enumValues)[number];

export type RoleClass = 'internal' | 'sa' | 'portal';

const INTERNAL_ARCHETYPES: ReadonlySet<Archetype> = new Set(['MP', 'AA', 'PL', 'CM', 'BM']);
const PORTAL_ARCHETYPES: ReadonlySet<Archetype> = new Set(['CC', 'IC', 'CB', 'EL']);

/**
 * `archetype` is `null` on an identity-only route (no active tenant, no resolved
 * principal) — the tightest class applies. Every other value the type admits is
 * exhaustively one of the ten membership-capable archetypes (`SA` plus the four
 * internal plus the four portal); a value reaching neither set falls through to
 * `'portal'` only via an unsafe cast, the same defensive shape `capabilityDef()`
 * uses for an id outside `CapabilityId`.
 */
export function roleClassFor(archetypeValue: Archetype | null): RoleClass {
  if (archetypeValue === null) return 'sa';
  if (archetypeValue === 'SA') return 'sa';
  if (INTERNAL_ARCHETYPES.has(archetypeValue)) return 'internal';
  if (PORTAL_ARCHETYPES.has(archetypeValue)) return 'portal';
  // Unreachable for any value the `Archetype` type admits — every one of the ten
  // enum values is covered by one of the three branches above. Falls through to
  // the least-restrictive-looking class only via an unsafe cast, the same
  // defensive shape `capabilityDef()` uses for an id outside `CapabilityId`; the
  // unit suite (tests/unit/session-lifecycle.test.ts) asserts every real
  // archetype is classified without reaching this line.
  return 'portal';
}

/**
 * The six numbers, verbatim from the constitution's Sessions section — a citation,
 * not derived here. Compile-time constants: no mechanism exists to make these
 * configurable (plan.md Constraints — the same non-configurability posture
 * `003/FR-007` already established for MFA enforcement).
 */
export const SESSION_LIMITS: Readonly<Record<RoleClass, { idleMinutes: number; absoluteMinutes: number }>> = {
  internal: { idleMinutes: 8 * 60, absoluteMinutes: 12 * 60 },
  sa: { idleMinutes: 30, absoluteMinutes: 8 * 60 },
  portal: { idleMinutes: 2 * 60, absoluteMinutes: 24 * 60 },
};
