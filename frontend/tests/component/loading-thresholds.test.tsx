/**
 * T035 — US3. research.md D4's two timers: a 120ms minimum display duration (never
 * flashes on the fast path) and a 10s error threshold (never spins indefinitely).
 *
 * Real timers throughout — TanStack Query's internal scheduling does not play cleanly
 * with `vi.useFakeTimers()`, and both constants are small enough that real waits are
 * fast and unambiguous.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import type { FailedResponse } from '@/lib/api-client';

function Harness({ queryFn }: { queryFn: () => Promise<{ items: string[] }> }) {
  const query = useQuery<{ items: string[] }, FailedResponse | null>({ queryKey: ['probe'], queryFn });
  return (
    <QueryBoundary query={query}>{(data) => <div data-testid="content">{data.items.join(',')}</div>}</QueryBoundary>
  );
}

function renderHarness(queryFn: () => Promise<{ items: string[] }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness queryFn={queryFn} />
    </QueryClientProvider>,
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('loading thresholds (research.md D4)', () => {
  it('a query resolving in <120ms never mounts LoadingState', async () => {
    renderHarness(() => wait(20).then(() => ({ items: ['a'] })));

    await waitFor(() => expect(screen.getByTestId('content')).toHaveTextContent('a'));
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
  });

  it('a query resolving in ~300ms shows LoadingState for the duration, replaced exactly once', async () => {
    renderHarness(() => wait(300).then(() => ({ items: ['b'] })));

    await waitFor(() => expect(screen.getByTestId('loading-state')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('content')).toHaveTextContent('b'), { timeout: 2000 });
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
  });

  it('a query still pending past the error threshold transitions to ErrorState (opaque bucket)', async () => {
    renderHarness(() => new Promise(() => {})); // never resolves

    await waitFor(() => expect(screen.getByTestId('error-state')).toBeInTheDocument(), { timeout: 11_000 });
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
  }, 15_000);
});
