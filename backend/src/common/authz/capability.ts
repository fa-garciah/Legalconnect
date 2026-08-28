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
 * The thirty-five capabilities (004's 1-21, 017's 22-24, 006's 25-35). Ids are
 * `module.verb`, matching the `audit_event.action` vocabulary's shape.
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
  // 017-firm-directory, rows 22-24 (FR-016 — extends this registry in the same
  // change that introduces the capability, per contracts/refusal.md §6).
  'directory.assign_position': { scope: 'tenant' },
  'directory.manage_catalog': { scope: 'tenant' },
  'directory.read': { scope: 'tenant' },
  // 006-client-case-core, rows 25-35 (FR-025 — extends this registry in the same change
  // that introduces the capability, per 004/FR-021).
  //
  // Rows 30, 32 and 33 are the FIRST capabilities in the product to resolve at `assigned`
  // scope. Until this slice the kind was declared here and unreachable: no resolver was
  // registered, and `decide()` refused it fail-closed. `modules/case-core` supplies the
  // resolver through `scope.ts`'s exported registration seam.
  //
  // Row 29 (`case.read_list`) is `tenant`, NOT `assigned`, and that is load-bearing rather
  // than an oversight. A scope resolver returns a boolean, so an `assigned`-scoped list
  // would REFUSE a caller with no assignments — while the spec requires them to receive an
  // empty list (FR-014, research.md D3). The scope check permits the call; the result set
  // is filtered by assignment inside the query. Do not "tidy" this row to `assigned`.
  //
  // Row 31 (`case.create`) is `tenant` for a different reason: there is no case to be
  // assigned to at the moment of creation (FR-015 names this exception explicitly).
  'client.read': { scope: 'tenant' },
  'client.create': { scope: 'tenant' },
  'client.update': { scope: 'tenant' },
  // Also governs restoration (FR-004a): whoever may withdraw a client may restore one, so
  // the two routes share this row rather than splitting a permission nobody asked to split.
  'client.deactivate': { scope: 'tenant' },
  'case.read_list': { scope: 'tenant' },
  'case.read': { scope: 'assigned' },
  'case.create': { scope: 'tenant' },
  'case.change_status': { scope: 'assigned' },
  'case.manage_team': { scope: 'assigned' },
  'case.read_catalog': { scope: 'tenant' },
  'case.manage_catalog': { scope: 'tenant' },
  // 007-document-management, rows 36-43 (FR-022 — extends this registry in the same
  // change that introduces the capability, per 004/FR-021).
  //
  // Rows 36-41 resolve at `assigned` scope, via the document's OWN case reference —
  // no second resolver is registered (spec.md FR-005/FR-008). A document is never
  // itself the scope target; `@ScopeTarget('caseId')` on every route below names the
  // URL's own case segment, exactly as 006's own `assigned`-scoped routes already do.
  'document.upload': { scope: 'assigned' },
  'document.read': { scope: 'assigned' },
  // Equal to `document.read` (spec.md Decision 2) — no narrower grant invented.
  'document.download': { scope: 'assigned' },
  'document.change_category': { scope: 'assigned' },
  'document.withdraw': { scope: 'assigned' },
  'document.restore': { scope: 'assigned' },
  'document.read_catalog': { scope: 'tenant' },
  'document.manage_catalog': { scope: 'tenant' },
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
