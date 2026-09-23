/**
 * The ten membership-capable archetype codes fixed by Constitution v1.4.0 Principle IV,
 * transcribed from `backend/src/common/tenant/principal.ts` rather than imported —
 * `frontend/` does not depend on `backend/`'s source tree (plan.md, Structure Decision).
 * `PO` is deliberately absent: it is not a membership and never appears in one.
 */
export type Archetype = 'SA' | 'MP' | 'AA' | 'PL' | 'CM' | 'BM' | 'CC' | 'IC' | 'CB' | 'EL';

export interface ActiveMembership {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly archetype: Archetype;
}

export interface Principal {
  /**
   * Whether a live session stands behind this principal. `020`-era addition, forced by a
   * dead end found in the browser: an EXPIRED session and an identity that simply belongs
   * to no firm both produced `{ identityId: '', memberships: [] }`, and the shell rendered
   * the same no-way-out screen for each. 002/FR-011 makes the second a legitimate, lasting
   * state, so the two must be tellable apart.
   *
   * Added BESIDE the existing fields rather than replacing them: eighteen files across six
   * slices read `identityId` and `memberships`, and none of them need to change.
   */
  readonly authenticated: boolean;
  readonly identityId: string;
  /** Every LIVE membership the identity holds, across every tenant (002/FR-017). */
  readonly memberships: readonly ActiveMembership[];
}
