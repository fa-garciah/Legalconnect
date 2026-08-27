/**
 * T016 — the one region-backing primitive (contracts/feedback-states.md §1). Renders
 * exactly one of loading/error/empty/content for a given `UseQueryResult`, never two
 * (FR-019, data-model.md `RegionState`).
 *
 * A `queryFn` used with this component rejects with a `FailedResponse | null` (null for
 * a network failure) as its error — `api-client.ts`'s `apiFetch` never throws itself;
 * the caller's own hook throws `result.body`-shaped rejections so `query.error` here is
 * exactly what `classifyRefusal` expects.
 */
'use client';

import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { classifyRefusal } from './refusal-bucket';
import type { FailedResponse } from '../lib/api-client';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';

/** research.md D4 — two independent timers, tuned for opposite goals. */
const MINIMUM_DISPLAY_DURATION_MS = 120;
const ERROR_THRESHOLD_MS = 10_000;

export interface QueryBoundaryProps<T> {
  readonly query: Pick<UseQueryResult<T, FailedResponse | null>, 'status' | 'data' | 'error' | 'refetch' | 'fetchStatus'>;
  readonly isEmpty?: (data: T) => boolean;
  readonly children: (data: T) => React.ReactNode;
  /** Guidance text passed straight through to EmptyState when isEmpty(data) is true. */
  readonly emptyGuidance?: string;
}

export function QueryBoundary<T>({
  query,
  isEmpty,
  children,
  emptyGuidance,
}: QueryBoundaryProps<T>): React.JSX.Element | null {
  const isPending = query.status === 'pending';

  const [pastMinimumDuration, setPastMinimumDuration] = useState(false);
  const [pastErrorThreshold, setPastErrorThreshold] = useState(false);

  // Reset the two timer flags the instant a NEW pending period starts — adjusting
  // state during render (React's own sanctioned pattern for "derived state that
  // depends on a prop changing") rather than in an effect body, which is what
  // `react-hooks/set-state-in-effect` flags as a cascading-render risk.
  const [trackedPending, setTrackedPending] = useState(isPending);
  if (isPending !== trackedPending) {
    setTrackedPending(isPending);
    if (isPending) {
      setPastMinimumDuration(false);
      setPastErrorThreshold(false);
    }
  }

  useEffect(() => {
    if (!isPending) return;
    const minimumTimer = setTimeout(() => setPastMinimumDuration(true), MINIMUM_DISPLAY_DURATION_MS);
    const thresholdTimer = setTimeout(() => setPastErrorThreshold(true), ERROR_THRESHOLD_MS);
    return () => {
      clearTimeout(minimumTimer);
      clearTimeout(thresholdTimer);
    };
  }, [isPending]);

  const retry = () => {
    void query.refetch();
  };

  if (isPending) {
    // Still pending past the error threshold — treat as failed, opaque (FR-013's
    // "past a defined threshold"). Retry re-issues the same query (contracts §4).
    if (pastErrorThreshold) {
      return <ErrorState refusal={{ bucket: 'opaque' }} onRetry={retry} />;
    }
    // Fast path: resolves before the minimum display duration elapses — never flashes.
    if (!pastMinimumDuration) return null;
    return <LoadingState />;
  }

  if (query.status === 'error') {
    const refusal = classifyRefusal(query.error);
    return <ErrorState refusal={refusal} onRetry={retry} />;
  }

  // status === 'success'
  const data = query.data as T;
  if (isEmpty?.(data)) {
    return <EmptyState guidance={emptyGuidance} />;
  }
  return <>{children(data)}</>;
}
