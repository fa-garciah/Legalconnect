/**
 * 009 FR-017, FR-018. "Registro de Horas" becomes a real destination for exactly the archetypes
 * holding `time.read_own` — derived from `can()`, never restated, so a matrix change cannot leave a
 * dead link behind (`023`'s precedent).
 */
import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS, filterNavigationItems } from '@/shell/navigation-items';
import { can } from '@/authz/can';
import { buildMatrixViewModel } from '@/configuracion/matrix-view-model';

describe('the horas navigation item', () => {
  const item = NAVIGATION_ITEMS.find((i) => i.id === 'horas');

  it('is available', () => {
    expect(item?.available).toBe(true);
  });

  it('is shown exactly to the archetypes holding time.read_own — MP, AA, PL, CM', () => {
    for (const archetype of ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'] as const) {
      const shown = filterNavigationItems(NAVIGATION_ITEMS, archetype).some((i) => i.id === 'horas');
      expect(shown, archetype).toBe(can('time.read_own', archetype));
    }
    expect(can('time.read_own', 'AA')).toBe(true);
    expect(can('time.read_own', 'BM')).toBe(false);
    expect(can('time.read_own', 'SA')).toBe(false);
  });
});

describe('/configuracion shows the four rows read-only (009 Decision 5)', () => {
  it('in their own "Registro de horas" group, labelled in Spanish', () => {
    const group = buildMatrixViewModel().find((g) => g.title === 'Registro de horas');
    expect(group?.rows.map((r) => r.capability).sort()).toEqual(
      ['time.correct_own', 'time.discard_timer', 'time.log', 'time.read_own'],
    );
  });
});
