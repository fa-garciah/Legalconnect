/**
 * T014 — the grid/list preference. 023/FR-011, Decision 8.
 *
 * PER VIEWER, IN THE BROWSER, and that is the decision rather than the cheap option. A view
 * toggle is not firm data: storing it server-side would mean a table, a migration and a
 * capability for something that does not survive being wrong. Per-viewer also means two
 * people looking at the same firm may disagree about how they look at it, which is correct.
 *
 * EVERY ACCESS IS GUARDED, because `localStorage` is not a reliable store. In a private
 * window, with site data blocked, or during a prerender, the accessor itself throws rather
 * than returning null — and a preference is never worth a broken page. Both functions
 * therefore resolve every failure to the default and never propagate.
 */
export type ViewMode = 'grid' | 'list';

/** Namespaced, so it cannot collide with another screen's preference. */
export const VIEW_MODE_STORAGE_KEY = 'legalconnect.documentos.view-mode';

const DEFAULT_MODE: ViewMode = 'grid';

function isViewMode(value: unknown): value is ViewMode {
  return value === 'grid' || value === 'list';
}

export function readViewMode(): ViewMode {
  try {
    const stored = globalThis.localStorage?.getItem(VIEW_MODE_STORAGE_KEY);
    return isViewMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function writeViewMode(mode: ViewMode): void {
  try {
    globalThis.localStorage?.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Deliberately silent: the person chose a layout, not a guarantee that it is remembered.
  }
  emit();
}

/* --------------------------------------------------------------------------
 * A store, so React can read this without a hydration mismatch.
 *
 * WHY NOT `useState` + `useEffect`. Reading `localStorage` in a state initialiser makes the
 * client's first render disagree with the server's (which has no storage and always says
 * `grid`), and syncing it in an effect is a `setState` inside an effect — which this
 * repository's lint rules forbid, correctly: it is a second render for something that was
 * knowable before the first.
 *
 * `useSyncExternalStore` exists for exactly this. Its third argument is the SERVER snapshot,
 * so the server and the first client paint agree on `grid`, and the stored preference is
 * applied without a flash of the wrong layout or a warning in the console.
 * ----------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeViewMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the server renders, and what the first client paint must match. */
export function serverViewMode(): ViewMode {
  return DEFAULT_MODE;
}
