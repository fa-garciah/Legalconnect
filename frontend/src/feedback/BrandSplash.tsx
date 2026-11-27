/**
 * The splash a page shows while it loads: the product's mark and wordmark over a thin bar
 * that sweeps under them.
 *
 * It fades in after a short delay (`animate-splash-in`), so a navigation that resolves at
 * once never flashes it — the same intent as `QueryBoundary`'s minimum display duration.
 * With reduced motion requested, the mark does not pulse and the bar stands still.
 *
 * `role="status"` with its own text, so a screen reader hears "Cargando…" once; the mark
 * stays decorative (`BrandMark` is `aria-hidden`).
 */
import { BrandMark } from '@/shell/BrandMark';

export function BrandSplash(): React.JSX.Element {
  return (
    <div
      data-testid="brand-splash"
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] w-full animate-splash-in flex-col items-center justify-center gap-5"
    >
      <div className="flex items-center gap-3">
        <BrandMark size="lg" className="motion-safe:animate-pulse" />
        <span className="font-display text-2xl font-semibold whitespace-nowrap text-primary">LegalConnect MX</span>
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-accent" aria-hidden>
        <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-splash-bar" />
      </div>
      <span className="text-sm text-muted-foreground">Cargando…</span>
    </div>
  );
}
