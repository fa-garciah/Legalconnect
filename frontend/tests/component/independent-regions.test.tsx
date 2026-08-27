/**
 * T036 — US3. Two independent QueryBoundary regions on one screen; one resolving
 * before the other does not hold the other back (FR-013 scenario 4).
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import type { FailedResponse } from '@/lib/api-client';

function Region({ id, queryFn }: { id: string; queryFn: () => Promise<{ items: string[] }> }) {
  const query = useQuery<{ items: string[] }, FailedResponse | null>({ queryKey: [id], queryFn });
  return (
    <QueryBoundary query={query}>
      {(data) => <div data-testid={`content-${id}`}>{data.items.join(',')}</div>}
    </QueryBoundary>
  );
}

describe('independent regions', () => {
  it('the resolved region shows its own state while the other still shows loading', async () => {
    let resolveSlow!: (v: { items: string[] }) => void;
    const slow = new Promise<{ items: string[] }>((resolve) => (resolveSlow = resolve));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Region id="fast" queryFn={() => Promise.resolve({ items: ['fast'] })} />
        <Region id="slow" queryFn={() => slow} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('content-fast')).toHaveTextContent('fast'));
    // The slow region has not resolved yet — it must not show the fast region's content.
    expect(screen.queryByTestId('content-slow')).not.toBeInTheDocument();

    resolveSlow({ items: ['slow'] });
    await waitFor(() => expect(screen.getByTestId('content-slow')).toHaveTextContent('slow'));
    // Both now independently show their own content.
    expect(screen.getByTestId('content-fast')).toHaveTextContent('fast');
  });
});
