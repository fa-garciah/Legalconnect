/**
 * T020 — filtering a NavigationItem[] by archetype. FR-002 to FR-004.
 */
import { describe, expect, it } from 'vitest';
import { filterNavigationItems, type NavigationItem } from '@/shell/navigation-items';

const FIXTURE: readonly NavigationItem[] = [
  { id: 'everyone', label: 'Para todos', href: '/everyone' },
  { id: 'sa-only', label: 'Solo SA', href: '/sa-only', requiredArchetypes: ['SA'] },
  { id: 'sa-or-mp', label: 'SA o MP', href: '/sa-or-mp', requiredArchetypes: ['SA', 'MP'] },
];

describe('filterNavigationItems', () => {
  it('an item with no requiredArchetypes is visible to every archetype', () => {
    expect(filterNavigationItems(FIXTURE, 'CC').map((i) => i.id)).toContain('everyone');
    expect(filterNavigationItems(FIXTURE, 'SA').map((i) => i.id)).toContain('everyone');
  });

  it('an item requiring an archetype the caller does not hold is excluded', () => {
    const result = filterNavigationItems(FIXTURE, 'MP');
    expect(result.map((i) => i.id)).not.toContain('sa-only');
  });

  it('an item requiring an archetype the caller holds is included', () => {
    const result = filterNavigationItems(FIXTURE, 'MP');
    expect(result.map((i) => i.id)).toContain('sa-or-mp');
  });

  it('SA sees everyone-visible items and every item naming SA', () => {
    const result = filterNavigationItems(FIXTURE, 'SA').map((i) => i.id);
    expect(result).toEqual(['everyone', 'sa-only', 'sa-or-mp']);
  });

  it('a portal archetype sees only unrestricted items, per 004/FR-020', () => {
    const result = filterNavigationItems(FIXTURE, 'CC').map((i) => i.id);
    expect(result).toEqual(['everyone']);
  });
});
