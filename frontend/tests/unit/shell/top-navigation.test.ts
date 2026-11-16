/**
 * The top bar's layout of the navigation registry (branch `feat/top-navigation-layout`).
 *
 * The bar moves entries around; it must never change WHO sees them. Every expectation here is
 * derived from `filterNavigationItems`, the rule the rail already used, rather than restated.
 */
import { describe, expect, it } from 'vitest';
import { filterNavigationItems, NAVIGATION_ITEMS } from '@/shell/navigation-items';
import { isActiveHref, layoutTopNavigation } from '@/shell/top-navigation';
import type { Archetype } from '@/session/types';

const ARCHETYPES: readonly Archetype[] = ['MP', 'AA', 'PL', 'CM', 'BM', 'SA', 'CC', 'IC', 'CB', 'EL'];

describe('layoutTopNavigation', () => {
  it('places every entry the archetype may see exactly once, and no other', () => {
    for (const archetype of ARCHETYPES) {
      const { primary, upcoming, utility } = layoutTopNavigation(NAVIGATION_ITEMS, archetype);
      const placed = [...primary, ...upcoming, ...utility].map((item) => item.id).sort();
      const allowed = filterNavigationItems(NAVIGATION_ITEMS, archetype).map((item) => item.id).sort();
      expect(placed, archetype).toEqual(allowed);
    }
  });

  it('keeps unbuilt sections out of the row of links', () => {
    const { primary, upcoming, utility } = layoutTopNavigation(NAVIGATION_ITEMS, 'SA');
    expect([...primary, ...utility].every((item) => item.available !== false)).toBe(true);
    expect(upcoming.every((item) => item.available === false)).toBe(true);
    expect(upcoming.map((item) => item.id)).toContain('conectores');
  });

  it('draws Configuración with the account controls, and only for those who hold it', () => {
    expect(layoutTopNavigation(NAVIGATION_ITEMS, 'SA').utility.map((item) => item.id)).toEqual(['configuracion']);
    expect(layoutTopNavigation(NAVIGATION_ITEMS, 'AA').utility).toEqual([]);
  });

  it('keeps the registry order in the row', () => {
    const { primary } = layoutTopNavigation(NAVIGATION_ITEMS, 'MP');
    const registryOrder = NAVIGATION_ITEMS.map((item) => item.id).filter((id) => primary.some((item) => item.id === id));
    expect(primary.map((item) => item.id)).toEqual(registryOrder);
  });
});

describe('isActiveHref', () => {
  it('matches a section and the routes under it', () => {
    expect(isActiveHref('/expedientes', '/expedientes')).toBe(true);
    expect(isActiveHref('/expedientes', '/expedientes/abc/documentos')).toBe(true);
  });

  it('does not light up a section whose name merely starts the same', () => {
    expect(isActiveHref('/documentos', '/documentos-archivados')).toBe(false);
  });

  it('matches the root only exactly', () => {
    expect(isActiveHref('/', '/')).toBe(true);
    expect(isActiveHref('/', '/clientes')).toBe(false);
  });

  it('is false outside a router', () => {
    expect(isActiveHref('/clientes', null)).toBe(false);
  });
});
