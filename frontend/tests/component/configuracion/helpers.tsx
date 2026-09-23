/** Shared scaffolding for 014's component tests. */
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

export function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Routes a mocked `fetch` by method and path, so a test says what each endpoint answers rather
 * than the order calls happen in. An unrouted call fails the test loudly.
 */
export function route(table: Record<string, () => Response>) {
  return (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^\/api\/lc/, '').split('?')[0];
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${path}`;
    const handler = table[key];
    if (!handler) return Promise.reject(new Error(`unrouted request: ${key}`));
    return Promise.resolve(handler());
  };
}
