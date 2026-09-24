/**
 * 021 T026 (US4, Decision 6). The firm's document categories, in `/configuracion`.
 *
 * Active and retired are both listed — a retired category still names documents filed under it
 * (007/FR-012). Create and retire for `document.manage_catalog` (MP, SA). The default category
 * reads "Sin clasificar" even where the stored name is still the English one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { DocumentCategoriesTab } from '@/app/configuracion/components/DocumentCategoriesTab';
import { json, renderWithClient, route } from './helpers';

const CATALOG = {
  items: [
    { id: 'c1', name: 'Contrato', status: 'active' },
    { id: 'c2', name: 'Unclassified', status: 'active' },
    { id: 'c3', name: 'Borrador antiguo', status: 'retired', retiredAt: '2026-01-01T00:00:00Z' },
  ],
};

describe('DocumentCategoriesTab', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

  function open(archetype: 'SA' | 'MP' | 'AA' = 'MP', extra: Record<string, () => Response> = {}) {
    fetchMock.mockImplementation(route({ 'GET /tenant/document-categories': () => json(CATALOG), ...extra }));
    return renderWithClient(<DocumentCategoriesTab archetype={archetype} />);
  }

  it('lists active and retired categories, the default as "Sin clasificar"', async () => {
    open();
    const retired = (await screen.findByText('Borrador antiguo')).closest('tr')!;
    expect(within(retired).getByText('Retirada')).toBeInTheDocument();
    expect(screen.getByText('Sin clasificar')).toBeInTheDocument();
    expect(screen.queryByText('Unclassified')).not.toBeInTheDocument();
  });

  it('offers create and retire (active rows only) to MP and SA', async () => {
    open('SA');
    const active = (await screen.findByText('Contrato')).closest('tr')!;
    const retired = screen.getByText('Borrador antiguo').closest('tr')!;
    expect(screen.getByRole('button', { name: /nueva categoría/i })).toBeInTheDocument();
    expect(within(active).getByRole('button', { name: /retirar/i })).toBeInTheDocument();
    expect(within(retired).queryByRole('button', { name: /retirar/i })).not.toBeInTheDocument();
  });

  it('offers neither without document.manage_catalog', async () => {
    open('AA');
    await screen.findByText('Contrato');
    expect(screen.queryByRole('button', { name: /nueva categoría/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirar/i })).not.toBeInTheDocument();
  });

  it('creates with the trimmed name', async () => {
    const user = userEvent.setup();
    open('MP', {
      'POST /tenant/document-categories': () => json({ id: 'c4', name: 'Poderes notariales', status: 'active' }, 201),
    });
    await user.click(await screen.findByRole('button', { name: /nueva categoría/i }));
    await user.type(screen.getByLabelText(/nombre de la categoría/i), '  Poderes notariales ');
    await user.click(screen.getByRole('button', { name: /crear categoría/i }));
    await waitFor(() => expect(JSON.parse(posts()[0]![1].body as string)).toEqual({ name: 'Poderes notariales' }));
  });

  it('refuses a duplicate of an active name before sending', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: /nueva categoría/i }));
    await user.type(screen.getByLabelText(/nombre de la categoría/i), 'contrato');
    await user.click(screen.getByRole('button', { name: /crear categoría/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ya existe/i);
    expect(posts()).toHaveLength(0);
  });

  it('a server 409 reads in Spanish', async () => {
    const user = userEvent.setup();
    open('MP', {
      'POST /tenant/document-categories': () =>
        json({ error: { code: 'catalog_entry_already_exists', message: 'An active entry exists.' } }, 409),
    });
    await user.click(await screen.findByRole('button', { name: /nueva categoría/i }));
    await user.type(screen.getByLabelText(/nombre de la categoría/i), 'Evidencia');
    await user.click(screen.getByRole('button', { name: /crear categoría/i }));
    expect(await screen.findByText(/ya existe una categoría activa/i)).toBeInTheDocument();
    expect(screen.queryByText(/An active entry/)).not.toBeInTheDocument();
  });

  it('"Retirar" confirms, explaining filed documents keep it, then retires', async () => {
    const user = userEvent.setup();
    open('MP', {
      'PATCH /tenant/document-categories/c1/retire': () => json({ id: 'c1', name: 'Contrato', status: 'retired' }),
    });
    const row = (await screen.findByText('Contrato')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /retirar/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/conservan/i);
    await user.click(within(dialog).getByRole('button', { name: /retirar categoría/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/c1/retire'))).toBe(true),
    );
  });
});
