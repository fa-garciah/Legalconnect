/**
 * T018 — FR-025: `capability-matrix.ts` must stay a faithful build-time mirror of
 * `004/spec.md`'s Capability Matrix, never a second source of truth (research.md D1).
 *
 * `FOUR_ZERO_FOUR_MATRIX_FIXTURE` below is transcribed by hand from the specs' Capability
 * Matrix tables, dated against this slice's own creation (2026-08-26). If a matrix
 * changes, this fixture is updated in the same PR as the row of `capability-matrix.ts` it
 * backs.
 *
 * 018/T017 extended it with rows 25-28. The task named `004/spec.md` as the source; the
 * rows are not there. `004` owns rows 1-21 and the registry's *shape*, and later slices
 * extend the registry under `004/FR-021` — `017` added 22-24, `006` added 25-35. So the
 * client rows were transcribed from `006/spec.md`'s Capability Matrix, which is where they
 * are actually declared. The fixture's name is kept because what it means has not changed:
 * this is the specification side of the comparison, whichever spec wrote the row.
 *
 * The transcription is by hand, from the spec, on purpose. Copying it from
 * `capability-matrix.ts` — or generating both from one file — would produce a test that
 * agrees with itself no matter what either says.
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

  /*
   * Rows 25-28, from 006/spec.md's Capability Matrix. Read across each row of that table
   * and take the ✅ columns; the ❌ columns are absent here rather than present-and-false,
   * because the registry denies by default.
   *
   *   | 25 | Read a client       | MP ✅ AA ✅ PL ✅ CM ✅ BM ✅ SA ✅ PO ❌ |
   *   | 26 | Create a client     | MP ✅ AA ❌ PL ✅ CM ❌ BM ✅ SA ✅ PO ❌ |
   *   | 27 | Update a client     | MP ✅ AA ❌ PL ✅ CM ❌ BM ✅ SA ✅ PO ❌ |
   *   | 28 | Deactivate a client | MP ✅ AA ❌ PL ❌ CM ❌ BM ✅ SA ✅ PO ❌ |
   */
  'client.read': new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),
  'client.create': new Set(['MP', 'PL', 'BM', 'SA']),
  'client.update': new Set(['MP', 'PL', 'BM', 'SA']),
  'client.deactivate': new Set(['MP', 'BM', 'SA']),

  /*
   * Rows 29-34, from 006/spec.md's Capability Matrix. Read across each row of that table and
   * take the ✅ columns; ❌ columns are absent here rather than present-and-false, because
   * the registry denies by default.
   *
   *   | 29 | Read the case list         | MP ✅ AA ✅ PL ✅ CM ✅ BM ❌ SA ✅ |
   *   | 30 | Read one case              | MP ✅ AA ✅ PL ✅ CM ✅ BM ❌ SA ✅ |
   *   | 31 | Create a case              | MP ✅ AA ❌ PL ❌ CM ✅ BM ❌ SA ✅ |
   *   | 32 | Change a case status       | MP ✅ AA ✅ PL ❌ CM ✅ BM ❌ SA ✅ |
   *   | 34 | Read the case catalogs     | MP ✅ AA ✅ PL ✅ CM ✅ BM ✅ SA ✅ |
   *
   * Row 33 (`case.manage_team`) is deliberately absent: `019` displays a case team and does
   * not edit one, so no control is keyed to it and the mirror must not carry a row nothing
   * reads.
   */
  'case.read_list': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
  'case.read': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
  'case.create': new Set(['MP', 'CM', 'SA']),
  'case.change_status': new Set(['MP', 'AA', 'CM', 'SA']),
  'case.read_catalog': new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),

  /*
   * Rows 22-24, from 017/spec.md's Capability Matrix, added by `014-admin-ui` (`/configuracion`
   * is the first screen keyed to them). Columns there are MP AA PL CM BM SA PO.
   *
   *   | 22 | Assign a member's position   | MP ✅ AA ❌ PL ❌ CM ❌ BM ❌ SA ✅ PO ❌ |
   *   | 23 | Define the position catalog  | MP ✅ AA ❌ PL ❌ CM ❌ BM ❌ SA ✅ PO ❌ |
   *   | 24 | Read own tenant's directory  | MP ✅ AA ✅ PL ✅ CM ✅ BM ✅ SA ✅ PO ❌ |
   */
  'directory.assign_position': new Set(['MP', 'SA']),
  'directory.manage_catalog': new Set(['MP', 'SA']),
  'directory.read': new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),

  /*
   * Rows 36-43, from 007/spec.md's Capability Matrix, added by `021-frontend-documents`.
   * Columns there are MP AA PL CM BM SA PO.
   *
   *   | 36 | Upload a document               | MP ✅ AA ✅ PL ✅ CM ✅ BM ❌ SA ✅ PO ❌ |
   *   | 37 | Read a case's documents         | MP ✅ AA ✅ PL ✅ CM ✅ BM ❌ SA ✅ PO ❌ |
   *   | 38 | Download a document             | MP ✅ AA ✅ PL ✅ CM ✅ BM ❌ SA ✅ PO ❌ |
   *   | 39 | Change a document's category    | MP ✅ AA ❌ PL ❌ CM ✅ BM ❌ SA ✅ PO ❌ |
   *   | 40 | Withdraw a document             | MP ✅ AA ❌ PL ❌ CM ❌ BM ❌ SA ✅ PO ❌ |
   *   | 41 | Restore a withdrawn document    | MP ✅ AA ❌ PL ❌ CM ❌ BM ❌ SA ✅ PO ❌ |
   *   | 42 | Read the category catalog       | MP ✅ AA ✅ PL ✅ CM ✅ BM ❌ SA ✅ PO ❌ |
   *   | 43 | Manage the category catalog     | MP ✅ AA ❌ PL ❌ CM ❌ BM ❌ SA ✅ PO ❌ |
   */
  'document.upload': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
  'document.read': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
  'document.download': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
  'document.change_category': new Set(['MP', 'CM', 'SA']),
  'document.withdraw': new Set(['MP', 'SA']),
  'document.restore': new Set(['MP', 'SA']),
  'document.read_catalog': new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
  'document.manage_catalog': new Set(['MP', 'SA']),
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
