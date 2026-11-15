/**
 * The product's sections, laid out horizontally in the top bar (the top-navigation proposal).
 *
 * Reads the same registry and the same archetype rule as the left rail it replaces on wide
 * screens (`top-navigation.ts`), so what a person may open is unchanged; only where the links
 * are drawn is.
 *
 * WHY SOME LINKS MOVE INTO "MÁS" ON NARROWER SCREENS. Six sections plus the brand and the
 * account controls do not fit in one row at 1024px, and a bar that wraps or scrolls sideways
 * is worse than one that folds. So the row keeps the first four sections from `lg`, the fifth
 * from `xl`, and all of them from 1400px; the rest sit one click away under "Más", in registry
 * order. It is done with breakpoint classes rather than by measuring the DOM, so the server
 * render and the first client render agree and nothing jumps after hydration.
 *
 * "Más" also holds the sections that are not built yet. They are still rendered, and still
 * not links (see `NavigationMenu` for why), but they no longer take a third of the bar.
 *
 * Below `lg` this whole component is hidden and the drawer in `Shell` takes over.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { NAVIGATION_ICONS } from './navigation-icons';
import type { NavigationItem } from './navigation-items';
import { isActiveHref } from './top-navigation';

/**
 * From which breakpoint a section is drawn in the row itself, by its position.
 * Literal class strings on purpose: Tailwind only generates what it can read in the source.
 */
type Tier = 0 | 1 | 2;
const tierOf = (index: number): Tier => (index < 4 ? 0 : index === 4 ? 1 : 2);

/** In the row. */
const INLINE: Readonly<Record<Tier, string>> = { 0: 'flex', 1: 'hidden xl:flex', 2: 'hidden min-[1400px]:flex' };
/** Under "Más" — the exact complement of `INLINE`, so a section is never in both places. */
const OVERFLOW: Readonly<Record<Tier, string>> = { 0: 'hidden', 1: 'flex xl:hidden', 2: 'flex min-[1400px]:hidden' };
/** The active marker under "Más", shown only while the active section is folded into it. */
const MORE_MARKER: Readonly<Record<Tier, string>> = { 0: 'hidden', 1: 'block xl:hidden', 2: 'block min-[1400px]:hidden' };

const ROW_ITEM =
  'group relative h-full items-center px-1 text-sm font-medium outline-none transition-colors';
const ROW_LABEL =
  'flex items-center gap-1 rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors group-hover:bg-secondary group-focus-visible:ring-2 group-focus-visible:ring-ring';
/** The line under the current section, sitting on the bar's own bottom edge. */
const MARKER = 'absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary';

export interface TopNavigationProps {
  /** The sections that exist, already filtered for the archetype, in registry order. */
  readonly primary: readonly NavigationItem[];
  /** The sections not built yet. */
  readonly upcoming: readonly NavigationItem[];
  readonly testId?: string;
}

export function TopNavigation({
  primary,
  upcoming,
  testId = 'shell-nav',
}: TopNavigationProps): React.JSX.Element {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const activeIndex = primary.findIndex((item) => isActiveHref(item.href, pathname));
  const activeTier: Tier = activeIndex === -1 ? 0 : tierOf(activeIndex);

  /*
   * When "Más" has anything in it. Always, if there are unbuilt sections; otherwise only at
   * the widths where a built section is folded into it.
   */
  const moreVisibility =
    upcoming.length > 0
      ? 'flex'
      : primary.length > 5
        ? 'flex min-[1400px]:hidden'
        : primary.length > 4
          ? 'flex xl:hidden'
          : null;

  return (
    <nav
      data-testid={testId}
      aria-label="Navegación principal"
      className="hidden h-full shrink-0 items-stretch lg:flex"
    >
      {primary.map((item, index) => {
        const isActive = index === activeIndex;
        return (
          <Link
            key={item.id}
            href={item.href}
            data-testid={`nav-item-${item.id}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              ROW_ITEM,
              INLINE[tierOf(index)],
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={ROW_LABEL}>{item.label}</span>
            {isActive ? <span aria-hidden className={MARKER} /> : null}
          </Link>
        );
      })}

      {moreVisibility ? (
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger
            data-testid="nav-more"
            className={cn(ROW_ITEM, moreVisibility, 'text-muted-foreground hover:text-foreground')}
          >
            <span className={ROW_LABEL}>
              Más
              <ChevronDown
                aria-hidden
                className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')}
              />
            </span>
            <span aria-hidden className={cn(MARKER, MORE_MARKER[activeTier])} />
          </PopoverTrigger>

          <PopoverContent align="start" sideOffset={0} className="w-64 p-2">
            <ul data-testid="nav-more-list" className="flex flex-col gap-0.5">
              {primary.map((item, index) => {
                const Icon = item.icon ? NAVIGATION_ICONS[item.icon] : undefined;
                const isActive = index === activeIndex;
                return (
                  <li key={item.id} className={OVERFLOW[tierOf(index)]}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-secondary',
                      )}
                    >
                      {Icon ? <Icon aria-hidden className="h-4 w-4 shrink-0" /> : null}
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}

              {upcoming.length > 0 ? (
                <li className="px-3 pt-2 pb-1 text-caption font-medium tracking-wide text-muted-foreground uppercase">
                  Próximamente
                </li>
              ) : null}

              {upcoming.map((item) => {
                const Icon = item.icon ? NAVIGATION_ICONS[item.icon] : undefined;
                return (
                  <li key={item.id}>
                    {/* A `span`, not a disabled link: nothing to activate, so nothing to tab onto. */}
                    <span
                      data-testid={`nav-item-${item.id}`}
                      data-unavailable="true"
                      title="Aún no disponible"
                      className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/70"
                    >
                      {Icon ? <Icon aria-hidden className="h-4 w-4 shrink-0" /> : null}
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Pronto
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </nav>
  );
}
