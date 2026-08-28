/**
 * T025 (016a) — FR-002 to FR-004. Filters `navigation-items.ts`'s registry (or an injected
 * list, for testability) against the active membership's archetype.
 *
 * Restyled as the product's left rail. Two states beyond "visible", and they mean different
 * things:
 *
 *   - **Absent** — the archetype does not hold this section. Not rendered at all, because a
 *     greyed-out row invites someone to go looking for the permission that would enable it.
 *   - **Unavailable** — the section is not built yet. Rendered, and not a link. The product's
 *     shape stays legible without the menu promising a page that would 404.
 *
 * Hiding is cosmetic either way: the server refuses the underlying request identically
 * whether or not a link was drawn (`016a`/FR-027).
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  Calendar,
  Clock,
  CreditCard,
  Database,
  FileText,
  Home,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterNavigationItems, type NavigationIconName, type NavigationItem } from './navigation-items';
import type { Archetype } from '../session/types';

/**
 * Name to component, resolved here because this is a Client Component and the registry
 * that names them is read on the server. See `NavigationIconName`.
 */
const ICONS: Readonly<Record<NavigationIconName, LucideIcon>> = {
  home: Home,
  briefcase: Briefcase,
  users: Users,
  'file-text': FileText,
  calendar: Calendar,
  'bar-chart': BarChart3,
  database: Database,
  clock: Clock,
  'credit-card': CreditCard,
  settings: Settings,
};

export interface NavigationMenuProps {
  readonly items: readonly NavigationItem[];
  readonly archetype: Archetype;
  /** Set on the mobile drawer's copy so the two navs never collide in a query. */
  readonly testId?: string;
  /** Closes the mobile drawer after a link is followed. */
  readonly onNavigate?: () => void;
}

export function NavigationMenu({
  items,
  archetype,
  testId = 'shell-nav',
  onNavigate,
}: NavigationMenuProps): React.JSX.Element {
  const pathname = usePathname();
  const visible = filterNavigationItems(items, archetype);

  return (
    <nav
      data-testid={testId}
      aria-label="Navegación principal"
      className="flex flex-1 flex-col gap-1 overflow-y-auto p-4"
    >
      {visible.map((item) => {
        const Icon = item.icon ? ICONS[item.icon] : undefined;
        // Exact match, except for the root, which would otherwise light up on every route.
        const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href) === true;

        const contents = (
          <>
            {Icon ? <Icon aria-hidden className="h-5 w-5 shrink-0" /> : null}
            <span className="truncate">{item.label}</span>
            {item.available === false ? (
              <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Pronto
              </span>
            ) : null}
          </>
        );

        if (item.available === false) {
          /*
           * A `span`, not a disabled link or button. There is nothing to activate, so there
           * should be nothing focusable to tab through — and `aria-disabled` on a link a
           * screen reader can still follow is a worse answer than not being a link.
           */
          return (
            <span
              key={item.id}
              data-testid={`nav-item-${item.id}`}
              data-unavailable="true"
              title="Aún no disponible"
              className="flex cursor-default items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground/60"
            >
              {contents}
            </span>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            data-testid={`nav-item-${item.id}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {contents}
          </Link>
        );
      })}
    </nav>
  );
}
