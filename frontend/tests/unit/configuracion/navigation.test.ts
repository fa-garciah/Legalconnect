/**
 * 014 T018 (FR-025). `/configuracion` becomes a real destination, for SA and MP only.
 *
 * The item flips in the same change as the first working tab, never before: an available item
 * that leads to an empty page is the dead end `016a` exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS, filterNavigationItems } from '@/shell/navigation-items';

describe('the configuracion navigation item', () => {
  const item = NAVIGATION_ITEMS.find((i) => i.id === 'configuracion');

  it('is available', () => {
    expect(item?.available).toBe(true);
  });

  it('is shown to SA and MP only', () => {
    expect([...(item?.requiredArchetypes ?? [])].sort()).toEqual(['MP', 'SA']);
    for (const archetype of ['AA', 'PL', 'CM', 'BM'] as const) {
      expect(filterNavigationItems(NAVIGATION_ITEMS, archetype).map((i) => i.id)).not.toContain(
        'configuracion',
      );
    }
  });
});
