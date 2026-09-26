/**
 * 015 — one figure, its change and the sample it came from. FR-008, FR-010, Decision 8.
 *
 * THE DELTA IS ABSENT, NOT ZERO, when there is nothing to compare against: `formatDelta`
 * returns an empty string and this renders no element at all. A "0 %" where a comparison does
 * not exist reads as "unchanged", which is a claim about last quarter that nobody made.
 *
 * The sample size sits under every average because an average of one matter and an average of
 * forty look identical otherwise, and only one of them is worth acting on.
 */
'use client';

import { Card, CardContent } from '@/components/ui/card';

export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  /** Empty string when there is no comparison — the element is then not rendered. */
  readonly delta?: string;
  readonly sample?: string;
  /** Shown instead of the value when the figure is withheld (FR-009). */
  readonly notice?: string;
  readonly testId: string;
}

export function StatTile({
  label,
  value,
  delta,
  sample,
  notice,
  testId,
}: StatTileProps): React.JSX.Element {
  return (
    <Card data-testid={testId}>
      <CardContent className="flex flex-col gap-1 p-5">
        <p className="text-small text-muted-foreground">{label}</p>
        {notice ? (
          <p className="text-heading font-semibold" data-testid={`${testId}-notice`}>
            {notice}
          </p>
        ) : (
          <p className="tabular text-hero font-semibold leading-tight" data-testid={`${testId}-value`}>
            {value}
          </p>
        )}
        {delta ? (
          <p className="tabular text-small text-muted-foreground" data-testid={`${testId}-delta`}>
            {delta} vs. periodo anterior
          </p>
        ) : null}
        {sample ? (
          <p className="text-caption text-muted-foreground" data-testid={`${testId}-sample`}>
            {sample}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
