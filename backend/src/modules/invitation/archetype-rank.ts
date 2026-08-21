/**
 * FR-021: "No issuer may grant a target archetype broader than the one they
 * themselves hold." The constitution fixes the ten archetype codes (Principle
 * IV) but does not fix a total order of "broadness" among them — that
 * ordering is this module's own, narrow decision, scoped to the invitation
 * ceiling check alone. It does not claim to be slice 004's global matrix.
 *
 * SA (System Administrator) outranks MP (Managing Partner), which outranks
 * the remaining internal archetypes (AA/PL/CM/BM, an unranked tier among
 * themselves), which outrank the portal archetypes (CC/IC/CB/EL, likewise
 * unranked among themselves). Only SA and MP ever reach this check at all —
 * FR-020 already restricts the invite capability to them — so the internal
 * and portal tiers below MP exist here only as valid invitation TARGETS, not
 * as issuers this ranking needs to distinguish from one another.
 */
import type { Archetype } from '../../common/tenant/principal';

const RANK: Readonly<Record<Archetype, number>> = {
  SA: 4,
  MP: 3,
  AA: 2,
  PL: 2,
  CM: 2,
  BM: 2,
  CC: 1,
  IC: 1,
  CB: 1,
  EL: 1,
};

/** True when `target` is strictly broader than `issuer` — the refusal case. */
export function isBroaderThan(target: Archetype, issuer: Archetype): boolean {
  return RANK[target] > RANK[issuer];
}
