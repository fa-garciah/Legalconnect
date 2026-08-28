/**
 * T019 — FR-025: a checked-in mirror of `004/spec.md`'s Capability Matrix, covering
 * exactly the rows this shell's own navigation items reference (research.md D1). Not a
 * runtime call — 004's matrix is a compile-time constant (004, Decision 4), and this
 * file is the build-time correspondence FR-025 asks for. Verified against
 * `004/spec.md` by `tests/unit/capability-matrix-sync.test.ts`.
 *
 * `018-frontend-clients` adds the first four rows. They were transcribed from
 * `006/spec.md`'s Capability Matrix (rows 25-28), which is where they are declared —
 * `004` owns rows 1-21 and the registry's shape, and `006` extends it under `004/FR-021`.
 * A domain slice adds its rows here in the same PR it adds its own navigation item — the
 * same discipline `004/contracts/refusal.md` §5 requires of a capability's own `MATRIX`
 * row.
 *
 * **What this is not.** It is not an authorization decision. The server refuses
 * independently and is the only thing standing between a caller and the data; these rows
 * only decide whether a control is worth drawing (018/FR-016). Deleting this file would
 * make the UI clumsier and change nothing about what anyone can do.
 */
import type { Archetype } from '../session/types';

type Subject = Archetype | 'PO';

export const CAPABILITY_MATRIX: Readonly<Record<string, ReadonlySet<Subject>>> = {
  // 006/spec.md row 25 — MP AA PL CM BM SA; PO holds nothing inside a tenant.
  'client.read': new Set<Subject>(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),
  // Row 26. AA and CM read the directory but do not add to it.
  'client.create': new Set<Subject>(['MP', 'PL', 'BM', 'SA']),
  // Row 27.
  'client.update': new Set<Subject>(['MP', 'PL', 'BM', 'SA']),
  // Row 28 — withdraw AND restore, deliberately one row (006/FR-004a): whoever may take a
  // client out of circulation is exactly whoever may put them back.
  'client.deactivate': new Set<Subject>(['MP', 'BM', 'SA']),
};
