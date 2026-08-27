/**
 * T016 — FR-013. Rendered only after research.md D4's 120ms minimum-display-duration
 * debounce has elapsed — `QueryBoundary` owns that timing; this component is pure
 * presentation (TDD exemption 4 covers the markup/styling below, not the timing logic
 * that decides whether to mount it).
 */
export function LoadingState(): React.JSX.Element {
  return (
    <div data-testid="loading-state" role="status" aria-live="polite" className="flex items-center gap-2 p-4">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span>Cargando…</span>
    </div>
  );
}
