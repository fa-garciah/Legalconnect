/**
 * The product's left rail: brand, navigation, and who you are signed in as.
 *
 * ON THE TOP-NAVIGATION BRANCH THIS IS THE NARROW-SCREEN DRAWER ONLY. From `lg` up the
 * navigation lives in `Header`/`TopNavigation`; `Shell` no longer mounts this as a fixed rail.
 * It is kept whole rather than rewritten so going back to the rail is a change to `Shell` alone.
 *
 * Three parts, and the third is the one that is easy to leave out. A person working in
 * several firms needs to know which identity the screen is acting as before they act, not
 * after — and the tenant they are acting *in* is named in the top bar for the same reason
 * (`016a`/FR-008).
 *
 * **The sign-out control is now wired.** It shipped here disabled, with a note that
 * authentication was slice `003` and there was no session to end — and that rendering it
 * disabled rather than plausibly-wired was deliberate, because a control that appears to
 * sign you out and does not is a security-shaped lie. `003` shipped the session and `005`
 * shipped the revocation route, so the placeholder is redeemed rather than removed.
 *
 * It is a FORM submitting a server action, not an `onClick`. The API credential lives in
 * an httpOnly cookie no script on this page can read (003/FR-051), so the revocation has
 * to happen on the server; a form also means the control works before hydration, which
 * matters for the one control whose whole job is to get somebody out.
 */
'use client';

import { LogOut } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { NavigationMenu } from './NavigationMenu';
import { signOutAction } from '../session/sign-out';
import type { NavigationItem } from './navigation-items';
import type { ActiveMembership } from '../session/types';
import { ARCHETYPE_LABEL } from './archetype-labels';
import { initialsOf } from './initials';

/*
 * `initialsOf` moved to `initials.ts` when the top bar became its second reader. Re-exported
 * so this module's existing importers and tests are untouched.
 */
export { initialsOf };

export interface SidebarProps {
  readonly items: readonly NavigationItem[];
  readonly activeMembership: ActiveMembership;
  /** The signed-in person's display name. Until `003`, the tenant's own contact name. */
  readonly displayName: string;
  readonly navTestId?: string;
  readonly onNavigate?: () => void;
}

export function Sidebar({
  items,
  activeMembership,
  displayName,
  navTestId,
  onNavigate,
}: SidebarProps): React.JSX.Element {
  return (
    <div data-testid="shell-sidebar" className="flex h-full flex-col bg-rail">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b px-6">
        {/* The mark (`BrandMark`). Tokens, never literals — contracts/design-system.md §3.4. */}
        <BrandMark />
        <span className="truncate font-display text-xl font-semibold text-primary">LegalConnect MX</span>
      </div>

      <NavigationMenu
        items={items}
        archetype={activeMembership.archetype}
        testId={navTestId}
        onNavigate={onNavigate}
      />

      <div className="flex shrink-0 items-center gap-3 border-t p-4">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground"
        >
          {initialsOf(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ARCHETYPE_LABEL[activeMembership.archetype]}
          </p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            data-testid="sign-out"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LogOut aria-hidden className="h-5 w-5" />
            <span className="sr-only">Cerrar sesión</span>
          </button>
        </form>
      </div>
    </div>
  );
}
