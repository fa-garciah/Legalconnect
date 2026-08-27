/**
 * T019 — FR-025: a checked-in mirror of `004/spec.md`'s Capability Matrix, covering
 * exactly the rows this shell's own navigation items reference (research.md D1). Not a
 * runtime call — 004's matrix is a compile-time constant (004, Decision 4), and this
 * file is the build-time correspondence FR-025 asks for. Verified against
 * `004/spec.md` by `tests/unit/capability-matrix-sync.test.ts`.
 *
 * Starts empty: this slice ships no business screen (spec.md, Out of Scope), so no
 * navigation item exists yet to reference a row. A domain slice adds one row here in
 * the same PR it adds its own navigation item — the same discipline
 * `004/contracts/refusal.md` §5 requires of a capability's own `MATRIX` row.
 */
import type { Archetype } from '../session/types';

type Subject = Archetype | 'PO';

export const CAPABILITY_MATRIX: Readonly<Record<string, ReadonlySet<Subject>>> = {};
