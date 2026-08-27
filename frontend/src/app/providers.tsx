/**
 * T017 — the `QueryClientProvider` every `QueryBoundary` in the tree needs. `retry:
 * false` by default: an automatic silent retry would mask the very error state FR-014
 * requires the person to see and act on (the explicit `ErrorState` retry button is the
 * one retry path this slice specifies — contracts/feedback-states.md §4).
 */
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
