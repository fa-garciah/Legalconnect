"use client";

import * as React from "react";

/**
 * Viewport-width hooks, ported with the component library (018/T011).
 *
 * **Why this file exports two names.** The prototype shipped *two different*
 * `use-mobile` implementations — one at `hooks/use-mobile.tsx` exporting `useMobile`
 * (parameterised breakpoint, `resize` listener), one at `components/ui/use-mobile.tsx`
 * exporting `useIsMobile` (fixed breakpoint, `matchMedia`). Both were imported from the
 * same specifier, `@/hooks/use-mobile`: `chart.tsx` wants `useMobile`, `sidebar.tsx` wants
 * `useIsMobile`.
 *
 * That means the prototype's own `components/ui/sidebar.tsx` could never have compiled
 * there either. It went unnoticed because the prototype renders its own
 * `components/sidebar.tsx` and never touches the library one — a latent break that only a
 * requirement to render every ported component (018/FR-024, T013) would ever surface.
 *
 * Both are kept rather than one being picked, because they are not interchangeable:
 * `useMobile` takes a breakpoint and `useIsMobile` does not, so collapsing them would
 * change one caller's behaviour silently.
 */

const MOBILE_BREAKPOINT = 768;

/**
 * True below `breakpoint`. Used by `chart.tsx`.
 *
 * `matchMedia` rather than the prototype's bare `resize` listener: it fires only when the
 * threshold is actually crossed, where `resize` fires on every pixel of a drag and
 * re-renders the consumer each time.
 */
export function useMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = (): void => setIsMobile(window.innerWidth < breakpoint);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}

/** True below the fixed 768px breakpoint. Used by `sidebar.tsx`. */
export function useIsMobile(): boolean {
  return useMobile(MOBILE_BREAKPOINT);
}
