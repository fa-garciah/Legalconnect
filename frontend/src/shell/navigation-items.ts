/**
 * T021 — the navigation registry (FR-002). A plain array literal, not a class or a
 * builder — there is no code path that could construct a malformed `NavigationItem`;
 * that is a compile error, not a runtime case this slice defends against
 * (data-model.md).
 *
 * Starts empty: this slice ships the mechanism, not business screens (spec.md, Out of
 * Scope). A domain slice adds its own item here, plus the matching row in
 * `authz/capability-matrix.ts` (FR-025), in the same PR that adds its screen.
 */
import type { Archetype } from '../session/types';

export interface NavigationItem {
  /** Stable across renames — the React key and the capability-matrix sync test's join key. */
  readonly id: string;
  /** Spanish, per FR-020. */
  readonly label: string;
  readonly href: string;
  /** Absent ⇒ visible to every authenticated archetype (FR-003). */
  readonly requiredArchetypes?: readonly Archetype[];
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [];

/** FR-002 to FR-004. An item with no requiredArchetypes is visible to every archetype. */
export function filterNavigationItems(
  items: readonly NavigationItem[],
  archetype: Archetype,
): readonly NavigationItem[] {
  return items.filter((item) => !item.requiredArchetypes || item.requiredArchetypes.includes(archetype));
}
