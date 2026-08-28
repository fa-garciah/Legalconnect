/**
 * The product's left rail: brand, navigation, and who you are signed in as.
 *
 * Three parts, and the third is the one that is easy to leave out. A person working in
 * several firms needs to know which identity the screen is acting as before they act, not
 * after — and the tenant they are acting *in* is named in the top bar for the same reason
 * (`016a`/FR-008).
 *
 * **The sign-out control is present and inert.** Authentication is slice `003`; there is no
 * session to end. It is rendered as a disabled button that says so rather than being
 * omitted, because a rail with a person's name and no way to leave reads as an oversight,
 * and rendered as *disabled* rather than wired to something plausible, because a control
 * that appears to sign you out and does not is a security-shaped lie.
 */
'use client';

import { LogOut } from 'lucide-react';
import { NavigationMenu } from './NavigationMenu';
import type { NavigationItem } from './navigation-items';
import type { ActiveMembership, Archetype } from '../session/types';

/** Spanish role names, so the rail does not show `MP` to someone who reads Spanish. */
const ARCHETYPE_LABEL: Readonly<Record<Archetype, string>> = {
  MP: 'Socio',
  AA: 'Abogado asociado',
  PL: 'Pasante',
  CM: 'Gestor de casos',
  BM: 'Administración',
  SA: 'Administrador',
  CC: 'Contacto de cliente',
  IC: 'Contacto de aseguradora',
  CB: 'Corredor',
  EL: 'Perito',
};

/** Initials for the avatar. Two at most; one when there is only one word. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
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
    <div data-testid="shell-sidebar" className="flex h-full flex-col bg-background">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b px-6">
        {/* The mark. A token, never a literal — contracts/design-system.md §3.4. */}
        <span aria-hidden className="h-8 w-8 shrink-0 rounded-md bg-primary" />
        <span className="truncate text-lg font-bold">LegalConnect MX</span>
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
        <button
          type="button"
          disabled
          title="Disponible cuando exista sesión iniciada"
          className="rounded-md p-2 text-muted-foreground disabled:opacity-50"
        >
          <LogOut aria-hidden className="h-5 w-5" />
          <span className="sr-only">Cerrar sesión (no disponible todavía)</span>
        </button>
      </div>
    </div>
  );
}
