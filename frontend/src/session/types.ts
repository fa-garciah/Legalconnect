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
  readonly identityId: string;
  /** Every LIVE membership the identity holds, across every tenant (002/FR-017). */
  readonly memberships: readonly ActiveMembership[];
}
