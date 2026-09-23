/**
 * The product's left rail: brand, navigation, and who you are signed in as.
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
import { NavigationMenu } from './NavigationMenu';
import { signOutAction } from '../session/sign-out';
import type { NavigationItem } from './navigation-items';
import type { ActiveMembership } from '../session/types';
import { ARCHETYPE_LABEL } from './archetype-labels';

/**
 * Initials for the avatar. Two at most; one when there is only one word.
 *
 * TAKES `string | undefined` BECAUSE THE VALUE COMES OFF THE NETWORK. `016a` typed this
 * `string` and was right to, against the checked-in fixture it was built on. `003` replaced
 * that fixture with a live call to `GET /identity/memberships`, whose contract returns
 * `{ membershipId, tenantId, archetype }` and NO `tenantName` — so the shell's
 * `displayName` is `undefined` at runtime while TypeScript still believes it is a string.
 * The first authenticated render crashed here with "Cannot read properties of undefined".
 *
 * The gap itself is now closed — `002`'s contract was amended to return `tenantName`
 * (migration 0043) — but the guard stays: this value still crosses a network boundary, and a
 * missing name must degrade to a placeholder, never take the whole shell down.
 */
export function initialsOf(name: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0]![0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

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
        {/* The mark. A token, never a literal — contracts/design-system.md §3.4. */}
        <span aria-hidden className="h-8 w-8 shrink-0 rounded-md bg-primary" />
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
