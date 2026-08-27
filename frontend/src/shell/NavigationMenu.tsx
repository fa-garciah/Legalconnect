/**
 * T025 — FR-002 to FR-004. Filters `navigation-items.ts`'s registry (or an injected
 * list, for testability) against the active membership's archetype.
 */
import Link from 'next/link';
import { filterNavigationItems, type NavigationItem } from './navigation-items';
import type { Archetype } from '../session/types';

export interface NavigationMenuProps {
  readonly items: readonly NavigationItem[];
  readonly archetype: Archetype;
}

export function NavigationMenu({ items, archetype }: NavigationMenuProps): React.JSX.Element {
  const visible = filterNavigationItems(items, archetype);
  return (
    <nav data-testid="shell-nav" aria-label="Navegación principal" className="flex flex-col gap-1 p-4">
      {visible.map((item) => (
        <Link key={item.id} href={item.href} className="rounded px-3 py-2 hover:bg-black/5">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
