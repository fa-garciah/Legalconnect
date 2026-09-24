/** 013 FR-013. "Calendario" becomes a real destination for every archetype holding calendar.read. */
import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS, filterNavigationItems } from '@/shell/navigation-items';
import { can } from '@/authz/can';

describe('the calendario navigation item', () => {
  const item = NAVIGATION_ITEMS.find((i) => i.id === 'calendario');

  it('is available', () => {
    expect(item?.available).toBe(true);
  });

  it('is shown exactly to the archetypes holding calendar.read', () => {
    for (const archetype of ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'] as const) {
      const shown = filterNavigationItems(NAVIGATION_ITEMS, archetype).some((i) => i.id === 'calendario');
      expect(shown, archetype).toBe(can('calendar.read', archetype));
    }
  });
});
