/**
 * T015 — the one region-backing primitive (contracts/feedback-states.md §1). Exactly
 * one of loading/error/empty/content renders, never two (FR-019).
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import type { FailedResponse } from '@/lib/api-client';

function renderWithQuery(queryFn: () => Promise<{ items: string[] }>, isEmpty?: (d: { items: string[] }) => boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const query = useQuery<{ items: string[] }, FailedResponse | null>({ queryKey: ['probe'], queryFn });
    return (
      <QueryBoundary query={query} isEmpty={isEmpty}>
        {(data) => <div data-testid="content">{data.items.join(',')}</div>}
      </QueryBoundary>
    );
  }
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('QueryBoundary', () => {
  it('renders content on success when isEmpty is false', async () => {
    renderWithQuery(() => Promise.resolve({ items: ['a'] }), (d) => d.items.length === 0);
    expect(await screen.findByTestId('content')).toHaveTextContent('a');
  });

  it('renders EmptyState when isEmpty(data) is true', async () => {
    renderWithQuery(() => Promise.resolve({ items: [] }), (d) => d.items.length === 0);
    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('renders ErrorState on a failed query', async () => {
    renderWithQuery(() => Promise.reject({ status: 404, body: { error: { code: 'not_found', message: 'x' } } }));
    expect(await screen.findByTestId('error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('never renders more than one of loading/error/empty/content at once', async () => {
    let resolve!: (v: { items: string[] }) => void;
    const pending = new Promise<{ items: string[] }>((r) => (resolve = r));
    renderWithQuery(() => pending, (d) => d.items.length === 0);

    // While pending: at most loading-state or nothing (pre-debounce), never content/error/empty.
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();

    resolve({ items: ['x'] });
    await waitFor(() => expect(screen.getByTestId('content')).toBeInTheDocument());
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
  });
});
