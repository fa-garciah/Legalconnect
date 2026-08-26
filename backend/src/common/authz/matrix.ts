/**
 * T007 — the matrix. A constant, per Decision 4: archetypes are fixed, so this is a
 * compile-time `Record`, not a per-tenant lookup.
 *
 * No import from `@nestjs/*`, `drizzle-orm` or `node:*` (research.md D1) — same
 * constraint as `capability.ts`, for the same reason.
 *
 * `Subject` is declared here rather than in `common/tenant/principal.ts`, because `PO`
 * is not a membership and `Archetype` must keep meaning "what can appear in the
 * enum column" (research.md D9).
 */
import type { Archetype } from '../tenant/principal';
import type { CapabilityId } from './capability';

export type Subject = Archetype | 'PO';

/** The eleven subject codes of Principle IV, in table order. */
export const SUBJECTS: readonly Subject[] = [
  'SA',
  'MP',
  'AA',
  'PL',
  'CM',
  'BM',
  'CC',
  'IC',
  'CB',
  'EL',
  'PO',
];

const ALL_ARCHETYPES: ReadonlySet<Subject> = new Set(SUBJECTS);

/**
 * Rows 9 and 10 (`invitation.accept_own`, `membership.read_own`) carry the full
 * subject set for documentation only. Their scope kind is `self`, and the `self`
 * resolver is the whole of the constraint — `decide()` does not consult this row for
 * them (research.md D8). Every other row is decided archetype-by-archetype.
 */
export const MATRIX: Readonly<Record<CapabilityId, ReadonlySet<Subject>>> = {
  'audit.read_own_tenant': new Set(['SA']),
  'invitation.issue': new Set(['SA', 'MP']),
  'invitation.revoke': new Set(['SA', 'MP']),
  'invitation.read_pending': new Set(['SA', 'MP']),
  'membership.read_tenant': new Set(['SA', 'MP']),
  'membership.revoke': new Set(['SA', 'MP']),
  'membership.change_archetype': new Set(['SA']),
  'plan.read_own_tenant': new Set(['SA', 'MP', 'BM']),
  'invitation.accept_own': ALL_ARCHETYPES,
  'membership.read_own': ALL_ARCHETYPES,
  'tenant.provision': new Set(['PO']),
  'tenant.deactivate': new Set(['PO']),
  'tenant.read_registry': new Set(['PO']),
  'audit.read_platform': new Set(['PO']),
  'tenant.change_plan': new Set(['PO']),
  'plan.configure_limits': new Set(['PO']),
  'invitation.issue_seed': new Set(['PO']),
  // Rows 18-21: held by nobody. Registered so the exhaustive test asserts it.
  'identity.read_registry': new Set([]),
  'identity.hard_delete': new Set([]),
  'membership.create_direct': new Set([]),
  'archetype.redefine': new Set([]),
};
