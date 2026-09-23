/**
 * Choosing which firm to work in. `016a`/FR-007's directive, given an actual screen.
 *
 * Reached only by somebody who belongs to MORE THAN ONE firm and has no valid remembered
 * choice. A single-firm identity never sees this — `resolveActiveTenant` enters its firm
 * directly — so every person who does see it has a real decision to make.
 *
 * WHY THERE IS NO "JOIN A FIRM" CONTROL. Membership is granted by a firm, through an
 * invitation its administrator issues (002). A join control would have to list firms the
 * person does NOT belong to, which is precisely the cross-tenant disclosure Principle II
 * forbids. Joining happens by following an invitation link, never from here.
 *
 * Each firm is a real `<button>`, so the list is reachable and operable by keyboard, and its
 * accessible name is the firm's name — a screen-reader user hears "Bufete Beta, S.C.", not
 * the fifth "Entrar" on the page.
 */
'use client';

import { Building2, ChevronRight } from 'lucide-react';
import { ARCHETYPE_LABEL } from './archetype-labels';
import { signOutAction } from '../session/sign-out';
import type { ActiveMembership } from '../session/types';

export interface FirmPickerProps {
  readonly memberships: readonly ActiveMembership[];
  readonly onChoose: (tenantId: string) => void;
}

export function FirmPicker({ memberships, onChoose }: FirmPickerProps): React.JSX.Element {
  return (
    // `no-active-tenant` is `016a`'s marker for FR-007's directive, and this screen IS that
    // directive — so it carries the marker, and 016a's own test keeps asserting it unchanged.
    <div
      data-testid="no-active-tenant"
      className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12"
    >
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span aria-hidden className="h-8 w-8 shrink-0 rounded-md bg-primary" />
          <span className="font-display text-xl font-semibold text-primary">LegalConnect MX</span>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="font-display text-heading font-semibold">Elige una firma</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu cuenta tiene acceso a más de una firma. Elige en cuál quieres trabajar; podrás
            cambiar después desde la barra superior.
          </p>

          <ul data-testid="firm-picker" className="mt-5 space-y-2">
            {memberships.map((membership) => (
              <li key={membership.tenantId}>
                <button
                  type="button"
                  onClick={() => onChoose(membership.tenantId)}
                  className="flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
                  >
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{membership.tenantName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ARCHETYPE_LABEL[membership.archetype]}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <form action={signOutAction} className="mt-6 text-center">
          <button
            type="submit"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
