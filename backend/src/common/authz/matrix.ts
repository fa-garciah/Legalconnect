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
  // 017-firm-directory, rows 22-24. Position is an organizational fact the
  // managing partner records, not a system-permission decision (017 spec.md,
  // Decision 1) — MP holds it alongside SA, unlike row 7's SA-only archetype
  // assignment. Row 24 is read by every internal archetype: everyone in the
  // firm needs to know who else is in it.
  'directory.assign_position': new Set(['MP', 'SA']),
  'directory.manage_catalog': new Set(['MP', 'SA']),
  'directory.read': new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),
  // 006-client-case-core, rows 25-35. spec.md Capability Matrix.
  //
  // `PL` holds create and update but NOT deactivate (spec.md Q1, resolved 2026-08-27).
  // The catalogue's own `US03-EP03-CLM-AddOrUpdateClientProfile` is a PL story about
  // intake — adding a client and correcting the record. Withdrawing one from future use
  // is a decision about the firm's engagements, not data hygiene, so it stays narrower.
  'client.read': new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),
  'client.create': new Set(['MP', 'PL', 'BM', 'SA']),
  'client.update': new Set(['MP', 'PL', 'BM', 'SA']),
  'client.deactivate': new Set(['MP', 'BM', 'SA']),
  // `BM` holds every client row and NO case row. Billing needs the party; case narrative
  // is outside its need to know (Principle VI's minimisation clause). A later billing
  // slice needing a case REFERENCE rather than case CONTENT declares its own capability
  // for that — it does not widen these rows.
  'case.read_list': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
  'case.read': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
  'case.create': new Set(['MP', 'CM', 'SA']),
  'case.change_status': new Set(['MP', 'AA', 'CM', 'SA']),
  'case.manage_team': new Set(['MP', 'CM', 'SA']),
  // Rows 34-35 mirror 017's rows 24 and 23 exactly rather than inventing a different rule
  // for a structurally identical catalog. `BM` reads them because matter type is how it
  // categorises what it bills — a catalog is the firm's vocabulary, not case content.
  'case.read_catalog': new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),
  'case.manage_catalog': new Set(['MP', 'SA']),
};
