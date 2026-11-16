/**
 * T026 / T033 (016a) — FR-001, FR-006, FR-008 to FR-010. Names the active tenant at all
 * times a tenant context is active; mounts `TenantSwitcher` only when the identity holds
 * more than one live membership (`TenantSwitcher` itself is the FR-010 check).
 *
 * THE TOP-NAVIGATION PROPOSAL (branch `feat/top-navigation-layout`). This used to be a thin
 * bar beside a 288px left rail. It is now the whole navigation on wide screens: brand on the
 * left, the sections in a row, and the account controls on the right, so the content region
 * below gets the full width of the window for tables.
 *
 * What did not move is the part `016a` requires: the active firm is named here, always, at
 * every viewport, and the switch sits next to its name. On a screen that reads and writes one
 * firm's records, "which firm am I in" must be answerable without scrolling or clicking.
 *
 * SIGN-OUT STAYS A VISIBLE FORM BUTTON, NOT AN ENTRY INSIDE AN ACCOUNT MENU. A menu only
 * opens after hydration; the form submits a server action without it, which matters for the
 * one control whose whole job is to get somebody out (see `Sidebar.tsx`).
 *
 * Below `lg` the row of sections, the settings link and the sign-out control are hidden here
 * and live in the drawer `Shell` opens from the menu button.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsUpDown, LogOut, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ARCHETYPE_LABEL } from './archetype-labels';
import { initialsOf } from './initials';
import { NAVIGATION_ICONS } from './navigation-icons';
import type { NavigationItem } from './navigation-items';
import { BrandMark } from './BrandMark';
import { TenantSwitcher } from './TenantSwitcher';
import { isActiveHref, layoutTopNavigation } from './top-navigation';
import { TopNavigation } from './TopNavigation';
import { signOutAction } from '../session/sign-out';
import type { ActiveMembership } from '../session/types';

const ICON_BUTTON =
  'h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export interface HeaderProps {
  readonly activeMembership: ActiveMembership;
  readonly memberships: readonly ActiveMembership[];
  readonly onSwitchTenant: (tenantId: string) => void;
  /** The navigation registry. Absent ⇒ the bar draws the brand and the account controls only. */
  readonly items?: readonly NavigationItem[];
  /** Opens the navigation drawer, which is how the sections are reached below `lg`. */
  readonly onOpenNavigation?: () => void;
}

export function Header({
  activeMembership,
  memberships,
  onSwitchTenant,
  items = [],
  onOpenNavigation,
}: HeaderProps): React.JSX.Element {
  const pathname = usePathname();
  const { primary, upcoming, utility } = layoutTopNavigation(items, activeMembership.archetype);
  // FR-010, read here only to draw the affordance; `TenantSwitcher` itself is the check.
  const canSwitch = memberships.length > 1;

  return (
    <header data-testid="shell-header" className="sticky top-0 z-30 shrink-0 border-b bg-background">
      {/* Same width and gutters as the content region, so the bar's edges line up with it. */}
      <div className="mx-auto flex h-16 w-full max-w-shell items-center gap-3 px-4 sm:px-6 lg:gap-5 lg:px-8">
        {onOpenNavigation ? (
          <button
            type="button"
            onClick={onOpenNavigation}
            className="-ml-2 rounded-md p-2 text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
          >
            <Menu aria-hidden className="h-5 w-5" />
            <span className="sr-only">Abrir navegación</span>
          </button>
        ) : null}

        <Link
          href="/"
          data-testid="shell-brand"
          className="flex shrink-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {/* The mark (`BrandMark`). Tokens, never literals — contracts/design-system.md §3.4. */}
          <BrandMark />
          <span className="font-display text-lg font-semibold whitespace-nowrap text-primary max-sm:sr-only">
            LegalConnect MX
          </span>
        </Link>

        <TopNavigation primary={primary} upcoming={upcoming} />

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {utility.map((item) => {
            const Icon = item.icon ? NAVIGATION_ICONS[item.icon] : undefined;
            const isActive = isActiveHref(item.href, pathname);
            return (
              <Link
                key={item.id}
                href={item.href}
                data-testid={`nav-item-${item.id}`}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                className={cn(
                  ICON_BUTTON,
                  'hidden lg:inline-flex',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {Icon ? <Icon aria-hidden className="h-5 w-5" /> : null}
                <span className="sr-only">{item.label}</span>
              </Link>
            );
          })}

          {/*
           * Who and where: the active firm and the role held in it. When the identity belongs
           * to several firms this whole block IS the switch — the native select is laid over
           * it, transparent, so the firm is named once instead of once as text and again as
           * the select's own value. It stays a real `<select>`: keyboard, screen readers and
           * the phone's own picker all keep working, and the block shows its focus ring.
           */}
          <div className="flex min-w-0 items-center lg:ml-1 lg:border-l lg:pl-3">
            <div
              className={cn(
                'relative flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1',
                canSwitch &&
                  'transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-secondary',
              )}
            >
              <span
                aria-hidden
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground xl:flex"
              >
                {initialsOf(activeMembership.tenantName)}
              </span>
              <div className="min-w-0 leading-tight">
                <p
                  data-testid="active-tenant-name"
                  className="truncate text-sm font-medium lg:max-w-36 xl:max-w-56"
                >
                  {activeMembership.tenantName}
                </p>
                <p className="hidden truncate text-xs text-muted-foreground lg:block">
                  {ARCHETYPE_LABEL[activeMembership.archetype]}
                </p>
              </div>
              {canSwitch ? (
                <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : null}
              <TenantSwitcher
                memberships={memberships}
                activeTenantId={activeMembership.tenantId}
                onSwitch={onSwitchTenant}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          <form action={signOutAction} className="hidden lg:block">
            <button
              type="submit"
              data-testid="sign-out"
              title="Cerrar sesión"
              className={cn(
                ICON_BUTTON,
                'inline-flex text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <LogOut aria-hidden className="h-5 w-5" />
              <span className="sr-only">Cerrar sesión</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
