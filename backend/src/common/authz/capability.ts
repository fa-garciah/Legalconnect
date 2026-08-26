/**
 * T005 — the capability registry. Principle IV's enumeration, made total.
 *
 * No import from `@nestjs/*`, `drizzle-orm` or `node:*` — this file must be loadable
 * without a framework or a container (research.md D1), which is what lets the
 * exhaustive unit suite run with no Testcontainers.
 *
 * `CapabilityId` is derived from these keys, never written out by hand — that is what
 * makes `matrix.ts`'s `Record<CapabilityId, …>` total and a missing row a compile
 * error (FR-021).
 */
import type { PlanLimits } from '../db/schema';

export type ScopeKind = 'tenant' | 'self' | 'assigned' | 'none';

export interface CapabilityDef {
  /** Exactly one, always. FR-013 — a capability declaring none is refused. */
  readonly scope: ScopeKind;
  /** Key into `plan.entitlements`. Absent ⇒ included in every plan (research.md D4). */
  readonly tier?: string;
  /** Key into `plan.limits`. Absent ⇒ no quantitative ceiling. */
  readonly limit?: keyof PlanLimits;
  /** Step-up MFA required (slice 005). Withheld from production until it lands. */
  readonly stepUp?: true;
}

/**
 * The twenty-one capabilities (data-model.md). Ids are `module.verb`, matching the
 * `audit_event.action` vocabulary's shape.
 *
 * No capability carries a `tier` or `limit` key at launch — plan.md Open Item 4. The
 * mechanism is built and tested; the commercial mapping awaits an owner. Rows 5 and 8
 * have no route today (the read was specified by 002 and never built); rows 18–21 are
 * held by nobody, registered so the exhaustive test asserts that rather than inferring
 * it from silence.
 */
export const CAPABILITIES = {
  'audit.read_own_tenant': { scope: 'tenant' },
  'invitation.issue': { scope: 'tenant', stepUp: true },
  'invitation.revoke': { scope: 'tenant', stepUp: true },
  'invitation.read_pending': { scope: 'tenant' },
  'membership.read_tenant': { scope: 'tenant' },
  'membership.revoke': { scope: 'tenant', stepUp: true },
  'membership.change_archetype': { scope: 'tenant', stepUp: true },
  'plan.read_own_tenant': { scope: 'tenant' },
  'invitation.accept_own': { scope: 'self' },
  'membership.read_own': { scope: 'self' },
  'tenant.provision': { scope: 'none' },
  'tenant.deactivate': { scope: 'none' },
  'tenant.read_registry': { scope: 'none' },
  'audit.read_platform': { scope: 'none' },
  'tenant.change_plan': { scope: 'none' },
  'plan.configure_limits': { scope: 'none' },
  'invitation.issue_seed': { scope: 'none', stepUp: true },
  'identity.read_registry': { scope: 'none' },
  'identity.hard_delete': { scope: 'none' },
  'membership.create_direct': { scope: 'none' },
  'archetype.redefine': { scope: 'none' },
} as const satisfies Readonly<Record<string, CapabilityDef>>;

export type CapabilityId = keyof typeof CAPABILITIES;

/**
 * Reads a registry entry as the general `CapabilityDef` shape. `CAPABILITIES` itself
 * keeps its precise per-key literal type (that is what makes `as const satisfies`
 * catch a malformed row at the definition site); this widens back for callers that
 * index it by a variable `CapabilityId`, where TypeScript would otherwise narrow to
 * the union of every branch and refuse a property absent from some of them.
 *
 * `CapabilityId` is closed at compile time, so `CAPABILITIES[id]` is total for every
 * value the type system admits — this only ever falls through to the default for a
 * value that reached here via an unsafe cast (deny-by-default.test.ts's deliberately-
 * cast fixture, quickstart.md Scenario 1). `none` is the least-consequence default
 * to fall back to: paired with `MATRIX`'s own defensive empty-set fallback in
 * `decide.ts`, an id nobody registered is refused on permission before scope is ever
 * consulted, never defaulted open.
 */
export function capabilityDef(id: CapabilityId): CapabilityDef {
  return (CAPABILITIES as Readonly<Record<string, CapabilityDef>>)[id] ?? { scope: 'none' };
}

/** The five step-up-gated rows (2, 3, 6, 7, 17), machine-readable — plan.md Open Item 6. */
export const STEP_UP_CAPABILITIES: ReadonlySet<CapabilityId> = new Set(
  (Object.keys(CAPABILITIES) as CapabilityId[]).filter((id) => capabilityDef(id).stepUp === true),
);
