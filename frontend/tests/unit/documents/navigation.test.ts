/**
 * T023 — 023/FR-014. "Documentos" becomes a real destination, for exactly the archetypes
 * that can use it.
 *
 * THE DEFECT THIS FIXES was latent rather than theoretical. The entry carried
 * `requiredArchetypes: INTERNAL`, which includes `BM`, while `MATRIX` grants `BM` **none** of
 * the nine `document.*` capabilities. That was invisible while `available: false` rendered it
 * as inert text — and the moment the flag flips, a billing manager gets a menu item leading
 * to a page that refuses every request it makes. `016a`'s own note calls that worse than an
 * honestly unavailable one, so the two edits are one change.
 */
import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS, filterNavigationItems } from '@/shell/navigation-items';
import { can } from '@/authz/can';

describe('the documentos navigation item', () => {
  const item = NAVIGATION_ITEMS.find((i) => i.id === 'documentos');

  it('exists and points at the Spanish route', () => {
    expect(item).toBeDefined();
    expect(item?.href).toBe('/documentos');
  });

  it('is available now that the screen exists', () => {
    expect(item?.available).toBe(true);
  });

  it('excludes BM explicitly', () => {
    expect(item?.requiredArchetypes).toEqual(['MP', 'AA', 'PL', 'CM', 'SA']);
    expect(item?.requiredArchetypes).not.toContain('BM');
  });

  it('is shown exactly to the archetypes holding document.read_list', () => {
    // The navigation and the matrix cannot be allowed to disagree: this derives the
    // expectation from `can()` rather than restating the list, so a future matrix change
    // makes this fail rather than leaving a dead link.
    for (const archetype of ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'] as const) {
      const shown = filterNavigationItems(NAVIGATION_ITEMS, archetype).some((i) => i.id === 'documentos');
      expect(shown, archetype).toBe(can('document.read_list', archetype));
    }
  });

  it('is shown to nobody who cannot read a document', () => {
    for (const archetype of ['BM', 'CC', 'IC', 'CB', 'EL'] as const) {
      const shown = filterNavigationItems(NAVIGATION_ITEMS, archetype).some((i) => i.id === 'documentos');
      expect(shown, archetype).toBe(false);
    }
  });
});
