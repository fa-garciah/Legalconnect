/**
 * T018 — FR-025: `capability-matrix.ts` must stay a faithful build-time mirror of
 * `004/spec.md`'s Capability Matrix, never a second source of truth (research.md D1).
 *
 * `FOUR_ZERO_FOUR_MATRIX_FIXTURE` below is transcribed by hand from
 * `specs/004-authorization-entitlements/spec.md`'s Capability Matrix table, dated
 * against this slice's own creation (2026-08-26). If 004's matrix changes, this
 * fixture is updated in the same PR as the row of `capability-matrix.ts` it backs.
 */
import { describe, expect, it } from 'vitest';
import { CAPABILITY_MATRIX } from '@/authz/capability-matrix';
import type { Archetype } from '@/session/types';

type Subject = Archetype | 'PO';

/** Transcribed from 004/spec.md's Capability Matrix — the rows this shell may reference. */
const FOUR_ZERO_FOUR_MATRIX_FIXTURE: Readonly<Record<string, ReadonlySet<Subject>>> = {
  'audit.read_own_tenant': new Set(['SA']),
  'invitation.issue': new Set(['SA', 'MP']),
  'invitation.revoke': new Set(['SA', 'MP']),
  'invitation.read_pending': new Set(['SA', 'MP']),
  'membership.read_tenant': new Set(['SA', 'MP']),
  'membership.revoke': new Set(['SA', 'MP']),
  'membership.change_archetype': new Set(['SA']),
  'plan.read_own_tenant': new Set(['SA', 'MP', 'BM']),
  'invitation.accept_own': new Set(['SA', 'MP', 'AA', 'PL', 'CM', 'BM', 'CC', 'IC', 'CB', 'EL']),
  'membership.read_own': new Set(['SA', 'MP', 'AA', 'PL', 'CM', 'BM', 'CC', 'IC', 'CB', 'EL']),
  'tenant.provision': new Set(['PO']),
  'tenant.deactivate': new Set(['PO']),
  'tenant.read_registry': new Set(['PO']),
  'audit.read_platform': new Set(['PO']),
  'tenant.change_plan': new Set(['PO']),
  'plan.configure_limits': new Set(['PO']),
  'invitation.issue_seed': new Set(['PO']),
  'identity.read_registry': new Set([]),
  'identity.hard_delete': new Set([]),
  'membership.create_direct': new Set([]),
  'archetype.redefine': new Set([]),
};

describe('capability-matrix.ts stays in sync with 004/spec.md', () => {
  it('every row this shell declares matches its 004 fixture row exactly', () => {
    for (const [id, subjects] of Object.entries(CAPABILITY_MATRIX)) {
      const expected = FOUR_ZERO_FOUR_MATRIX_FIXTURE[id];
      expect(expected, `${id} is not a real 004 capability id`).toBeDefined();
      expect([...subjects].sort(), `row ${id} diverges from 004/spec.md`).toEqual(
        [...(expected ?? [])].sort(),
      );
    }
  });

  // T018/Scenario 8 also asks that a deliberately-mutated row be caught. That is a
  // hand-verification step (quickstart.md Scenario 8), the same shape as 004's own
  // FR-021 hand-check (004/tasks.md T064) — recorded in quickstart-results.md, not
  // encoded as a permanent test here, since a permanently-mutated fixture would just be
  // a second, wrong source of truth sitting next to the correct one.
});
