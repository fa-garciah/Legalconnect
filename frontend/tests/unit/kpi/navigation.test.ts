/**
 * T020 — 015/FR-013. "KPIs" becomes a real destination, for exactly the archetypes that can use
 * it.
 *
 * THE SAME LATENT DEFECT `023` CORRECTED FOR `documentos`, and it is worth noticing that it was
 * waiting here too: the entry carried `requiredArchetypes: INTERNAL`, which includes `BM`, `AA`
 * and `PL` — none of whom holds `kpi.read`. Harmless only while `available: false` rendered it
 * as inert text; the moment the flag flips, three archetypes get a menu item leading to a page
 * that refuses every request it makes.
 */
import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS, filterNavigationItems } from '@/shell/navigation-items';
import { can } from '@/authz/can';

describe('the kpis navigation item', () => {
  const item = NAVIGATION_ITEMS.find((i) => i.id === 'kpis');

  it('exists and points at /kpis', () => {
    expect(item).toBeDefined();
    expect(item?.href).toBe('/kpis');
  });

  it('is available now that the screen exists', () => {
    expect(item?.available).toBe(true);
  });

  it('is narrowed to the three archetypes that hold kpi.read', () => {
    expect(item?.requiredArchetypes).toEqual(['MP', 'CM', 'SA']);
  });

  it('is shown exactly to the archetypes holding kpi.read', () => {
    // Derived from `can()` rather than restated, so a future matrix change fails here instead
    // of leaving a dead link behind.
    for (const archetype of ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'] as const) {
      const shown = filterNavigationItems(NAVIGATION_ITEMS, archetype).some((i) => i.id === 'kpis');
      expect(shown, archetype).toBe(can('kpi.read', archetype));
    }
  });

  it('is hidden from AA, PL, BM and every portal archetype', () => {
    for (const archetype of ['AA', 'PL', 'BM', 'CC', 'IC', 'CB', 'EL'] as const) {
      const shown = filterNavigationItems(NAVIGATION_ITEMS, archetype).some((i) => i.id === 'kpis');
      expect(shown, archetype).toBe(false);
    }
  });
});
