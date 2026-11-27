/**
 * T016 — FR-013. Rendered only after research.md D4's 120ms minimum-display-duration
 * debounce has elapsed — `QueryBoundary` owns that timing; this component is pure
 * presentation (TDD exemption 4 covers the markup/styling below, not the timing logic
 * that decides whether to mount it).
 *
 * The product's mark over a sweeping bar, in place of a generic spinner: the same sign the
 * page-level splash (`BrandSplash`) shows, at the size of a region.
 */
import { BrandMark } from '@/shell/BrandMark';

export function LoadingState(): React.JSX.Element {
  return (
    <div
      data-testid="loading-state"
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-4 p-12 text-muted-foreground"
    >
      <BrandMark size="lg" className="motion-safe:animate-pulse" />
      <div className="h-1 w-28 overflow-hidden rounded-full bg-accent" aria-hidden>
        <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-splash-bar" />
      </div>
      <span className="text-sm">Cargando…</span>
    </div>
  );
}
