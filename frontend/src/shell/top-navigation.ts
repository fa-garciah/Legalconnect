/**
 * How the top bar lays the navigation registry out. Pure, so it is tested without a DOM.
 *
 * The registry (`navigation-items.ts`) is unchanged: the rail and the top bar read the same
 * entries, filtered by the same archetype rule. What differs is only WHERE each entry goes:
 *
 *   - **primary** — the sections that exist, one click each, in registry order. They stay
 *     direct links rather than being folded into dropdowns: every one of them is a place
 *     somebody works in all day, and a second click on every visit is a tax with no return.
 *   - **upcoming** — the sections not built yet ("Pronto"). They stay visible, so the shape
 *     of the product is still legible, but behind one "Próximamente" control instead of
 *     taking a third of the bar's width.
 *   - **utility** — sections that belong with the account controls on the right rather than
 *     with the work. Today that is Configuración, drawn as the gear beside the avatar.
 *
 * Hiding stays cosmetic: the server refuses the underlying request identically whether or
 * not a link was drawn (`016a`/FR-027).
 */
import { filterNavigationItems, type NavigationItem } from './navigation-items';
import type { Archetype } from '../session/types';

/** Registry ids drawn on the right, beside the account menu, instead of in the main row. */
const UTILITY_IDS: ReadonlySet<string> = new Set(['configuracion']);

export interface TopNavigationLayout {
  readonly primary: readonly NavigationItem[];
  readonly upcoming: readonly NavigationItem[];
  readonly utility: readonly NavigationItem[];
}

export function layoutTopNavigation(
  items: readonly NavigationItem[],
  archetype: Archetype,
): TopNavigationLayout {
  const visible = filterNavigationItems(items, archetype);
  return {
    primary: visible.filter((item) => item.available !== false && !UTILITY_IDS.has(item.id)),
    upcoming: visible.filter((item) => item.available === false),
    utility: visible.filter((item) => item.available !== false && UTILITY_IDS.has(item.id)),
  };
}

/** Exact match for the root, which would otherwise light up on every route; prefix otherwise. */
export function isActiveHref(href: string, pathname: string | null): boolean {
  if (href === '/') return pathname === '/';
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
