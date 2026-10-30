/**
 * The client directory survives the case form's client picker having run first.
 *
 * Found in the browser on 2026-10-29: open "Nuevo expediente", then go to /clientes, and the
 * directory crashed with "Cannot read properties of undefined (reading 'length')". Both screens
 * cached their client list under the SAME key, `['clients', '', 'all']`: the picker as an
 * ordinary query holding one page of ACTIVE clients, the directory as an infinite query that
 * expects `{ pages, pageParams }`. React Query handed the picker's plain list to the directory's
 * paging, which read `pages.length` off it. Without the crash it would still have been wrong:
 * the directory's "all" would have shown the picker's active-only list.
 *
 * One QueryClient across both mounts, as the app's provider has — a fresh client per render is
 * exactly what hid this from every other test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/session/principal', () => ({
  getPrincipal: vi.fn().mockResolvedValue({ identityId: 'identity-1', memberships: [] }),
}));
vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { CaseFormDialog } from '@/app/expedientes/CaseFormDialog';
import { ClientDirectory } from '@/app/clientes/ClientDirectory';

const ACTIVE = { id: 'cl-1', kind: 'organization', legalName: 'Grupo Torres, S.A. de C.V.', rfc: null, status: 'active' };
const WITHDRAWN = { id: 'cl-2', kind: 'person', legalName: 'Juan Pérez López', rfc: null, status: 'inactive' };

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('client list cache shared by the case form and the directory', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((input: string) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname.endsWith('/tenant/clients')) {
        // What the server would answer: the picker asks for active only, the directory for all.
        const items = url.searchParams.get('status') === 'active' ? [ACTIVE] : [ACTIVE, WITHDRAWN];
        return Promise.resolve(json({ items, nextCursor: null }));
      }
      return Promise.resolve(json({ items: [], nextCursor: null }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('opens the directory after the case form, showing every client', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (ui: React.ReactElement) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;

    const form = render(wrap(<CaseFormDialog open onClose={vi.fn()} onSaved={vi.fn()} />));
    await screen.findByRole('dialog');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/tenant/clients'))).toBe(true),
    );
    form.unmount();

    render(wrap(<ClientDirectory archetype="SA" />));

    expect(await screen.findByText('Juan Pérez López')).toBeInTheDocument();
    expect(screen.getByText('Grupo Torres, S.A. de C.V.')).toBeInTheDocument();
  });
});
