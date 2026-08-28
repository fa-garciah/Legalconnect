/**
 * T021 (016a) — the navigation registry (FR-002). A plain array literal, not a class or a
 * builder — there is no code path that could construct a malformed `NavigationItem`; that
 * is a compile error, not a runtime case this slice defends against (data-model.md).
 *
 * `016a` shipped this empty by design. `018-frontend-clients` added the first real entry
 * and then, at the request of the product owner, the rest of the product's sections so the
 * shell reads as the application rather than as a one-item menu.
 *
 * **Only the sections that exist are links.** The other nine are `available: false`: they
 * render, so the shape of the product is visible and the roadmap is legible, and they are
 * *not* navigable, because a menu item that 404s is worse than one that is honestly marked
 * as not built. A domain slice flips its own flag in the same PR that adds its screen —
 * along with the matching row in `authz/capability-matrix.ts` (FR-025) and its real
 * `requiredArchetypes`.
 */
import type { Archetype } from '../session/types';

/**
 * The icon a section is drawn with, as a **name rather than a component**.
 *
 * This registry is read in the root layout, which is a Server Component, and handed to the
 * shell, which is a Client Component. Only serialisable values cross that boundary — an
 * icon component is a function, and passing one throws "Functions cannot be passed directly
 * to Client Components" at request time, not at build time.
 *
 * A name keeps the registry plain data. `NavigationMenu` maps it to a component on the
 * client side, where components are allowed to exist.
 */
export type NavigationIconName =
  | 'home'
  | 'briefcase'
  | 'users'
  | 'file-text'
  | 'calendar'
  | 'bar-chart'
  | 'database'
  | 'clock'
  | 'credit-card'
  | 'settings';

export interface NavigationItem {
  /** Stable across renames — the React key and the capability-matrix sync test's join key. */
  readonly id: string;
  /** Spanish, per FR-020. */
  readonly label: string;
  readonly href: string;
  /** Optional so a test fixture need not invent one; every real entry has one. */
  readonly icon?: NavigationIconName;
  /** Absent ⇒ visible to every authenticated archetype (FR-003). */
  readonly requiredArchetypes?: readonly Archetype[];
  /**
   * Whether the route behind this item exists yet. Absent ⇒ it does.
   *
   * `false` renders the item as an inert, visibly-unavailable row rather than a link. This
   * is a statement about the product's build order, never about permission — an item the
   * caller may not use is *absent*, not disabled (see `requiredArchetypes`).
   *
   * The default is "available" because that is the steady state: an entry exists because a
   * slice built the screen behind it. The nine `false`s below are the exception, added so
   * the rail shows the product's shape while it is still being built.
   */
  readonly available?: boolean;
}

/** The six internal archetypes. The four portal ones reach none of these sections. */
const INTERNAL: readonly Archetype[] = ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'];

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard Principal', href: '/', icon: 'home', available: true },
  {
    id: 'expedientes',
    label: 'Expedientes',
    href: '/expedientes',
    icon: 'briefcase',
    // `006` shipped the whole case API — including the product's first `assigned`-scope
    // capability — and no slice has rendered it yet.
    requiredArchetypes: INTERNAL,
    available: false,
  },
  {
    id: 'clientes',
    label: 'Clientes',
    href: '/clientes',
    icon: 'users',
    /*
     * The six internal archetypes, matching `client.read` (006/spec.md row 25) exactly.
     * The four portal archetypes — CC, IC, CB, EL — hold nothing on this row, so the link
     * is not drawn for them; they would be refused at the server anyway (018/FR-017).
     *
     * Listed rather than derived from CAPABILITY_MATRIX on purpose: an archetype seeing a
     * link and an archetype being allowed through are two different questions, and a slice
     * that wants a link visible to fewer people than the capability allows must be able to
     * say so without weakening the capability.
     */
    requiredArchetypes: ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'],
    available: true,
  },
  {
    id: 'documentos',
    label: 'Documentos',
    href: '/documentos',
    icon: 'file-text',
    // `007` shipped the API and four of its frontend tasks remain.
    requiredArchetypes: INTERNAL,
    available: false,
  },
  { id: 'calendario', label: 'Calendario', href: '/calendario', icon: 'calendar', requiredArchetypes: INTERNAL, available: false },
  { id: 'kpis', label: 'KPIs', href: '/kpis', icon: 'bar-chart', requiredArchetypes: INTERNAL, available: false },
  {
    id: 'conectores',
    label: 'Conectores Judiciales',
    href: '/conectores',
    icon: 'database',
    requiredArchetypes: INTERNAL,
    available: false,
  },
  { id: 'horas', label: 'Registro de Horas', href: '/horas', icon: 'clock', requiredArchetypes: INTERNAL, available: false },
  {
    id: 'facturacion',
    label: 'Facturación',
    href: '/facturacion',
    icon: 'credit-card',
    requiredArchetypes: INTERNAL,
    available: false,
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    href: '/configuracion',
    icon: 'settings',
    requiredArchetypes: INTERNAL,
    available: false,
  },
];

/** FR-002 to FR-004. An item with no requiredArchetypes is visible to every archetype. */
export function filterNavigationItems(
  items: readonly NavigationItem[],
  archetype: Archetype,
): readonly NavigationItem[] {
  return items.filter((item) => !item.requiredArchetypes || item.requiredArchetypes.includes(archetype));
}
