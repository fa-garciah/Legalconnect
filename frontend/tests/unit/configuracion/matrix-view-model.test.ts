/**
 * 014 T024 (US3, Decision 1). The read-only permissions matrix is built from the frontend's
 * mirror (`capability-matrix.ts`), which `capability-matrix-sync.test.ts` keeps faithful to the
 * specs. So the view cannot drift from what the server enforces without that test failing.
 */
import { describe, expect, it } from 'vitest';
import { CAPABILITY_MATRIX } from '@/authz/capability-matrix';
import { MATRIX_COLUMNS, buildMatrixViewModel } from '@/configuracion/matrix-view-model';

describe('permissions matrix view model', () => {
  const groups = buildMatrixViewModel();

  it('places every mirrored capability in exactly one group', () => {
    const placed = groups.flatMap((g) => g.rows.map((r) => r.capability));
    expect([...placed].sort()).toEqual(Object.keys(CAPABILITY_MATRIX).sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('leaves no group empty and no row unlabelled', () => {
    for (const group of groups) {
      expect(group.rows.length).toBeGreaterThan(0);
      for (const row of group.rows) expect(row.label).not.toBe(row.capability);
    }
  });

  it('uses the six internal archetypes as columns', () => {
    expect([...MATRIX_COLUMNS]).toEqual(['SA', 'MP', 'AA', 'PL', 'CM', 'BM']);
  });

  it('marks each cell exactly as the mirror does', () => {
    for (const row of groups.flatMap((g) => g.rows)) {
      for (const archetype of MATRIX_COLUMNS) {
        expect(row.allowed[archetype]).toBe(CAPABILITY_MATRIX[row.capability]!.has(archetype));
      }
    }
  });
});
