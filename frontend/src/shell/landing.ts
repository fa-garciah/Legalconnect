/**
 * Where `/` sends a signed-in person while the product has no home screen of its own.
 *
 * `016a`'s placeholder said it would redirect "once a domain slice adds its first real screen";
 * several have. The landing is the first section of the navigation this archetype can open,
 * read from the same registry the menu draws, so the two cannot disagree: a billing manager, who
 * holds no case capability, lands on the client directory rather than on a refusal.
 *
 * When `015`/EP01 builds a real home screen, `/` renders it and this goes.
 */
import type { Archetype } from '../session/types';
import { filterNavigationItems, NAVIGATION_ITEMS } from './navigation-items';

export function landingFor(archetype: Archetype): string | null {
  const first = filterNavigationItems(NAVIGATION_ITEMS, archetype).find(
    (item) => item.available && item.href !== '/',
  );
  return first?.href ?? null;
}
