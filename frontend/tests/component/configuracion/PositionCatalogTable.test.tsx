/**
 * 014 T021 (US2). The firm's position catalog (017).
 *
 * Active and retired positions are both listed, because a retired one still names people's past
 * rank in the directory. "Nuevo cargo" and "Retirar" are drawn only for
 * `directory.manage_catalog` (SA, MP). Neither is step-up gated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { PositionCatalogTable } from '@/app/configuracion/components/PositionCatalogTable';
import { json, renderWithClient, route } from './helpers';

const CATALOG = [
  { id: 'p1', name: 'Asociado Senior', status: 'active' },
  { id: 'p2', name: 'Pasante de verano', status: 'retired' },
];

describe('PositionCatalogTable', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists active and retired positions, and says which is which', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/directory/positions': () => json({ items: CATALOG }) }));
    renderWithClient(<PositionCatalogTable archetype="SA" />);

    const active = (await screen.findByText('Asociado Senior')).closest('tr')!;
    const retired = screen.getByText('Pasante de verano').closest('tr')!;
    expect(within(active).getByText(/activo/i)).toBeInTheDocument();
    expect(within(retired).getByText(/retirado/i)).toBeInTheDocument();
  });

  it('offers "Nuevo cargo" and "Retirar" (on active rows only) to SA and MP', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/directory/positions': () => json({ items: CATALOG }) }));
    renderWithClient(<PositionCatalogTable archetype="MP" />);

    const active = (await screen.findByText('Asociado Senior')).closest('tr')!;
    const retired = screen.getByText('Pasante de verano').closest('tr')!;
    expect(screen.getByRole('button', { name: /nuevo cargo/i })).toBeInTheDocument();
    expect(within(active).getByRole('button', { name: /retirar/i })).toBeInTheDocument();
    expect(within(retired).queryByRole('button', { name: /retirar/i })).not.toBeInTheDocument();
  });

  it('offers neither to an archetype without directory.manage_catalog', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/directory/positions': () => json({ items: CATALOG }) }));
    renderWithClient(<PositionCatalogTable archetype="AA" />);
    await screen.findByText('Asociado Senior');
    expect(screen.queryByRole('button', { name: /nuevo cargo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirar/i })).not.toBeInTheDocument();
  });

  it('says so when the firm defines no positions', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/directory/positions': () => json({ items: [] }) }));
    renderWithClient(<PositionCatalogTable archetype="SA" />);
    expect(await screen.findByText(/tu despacho aún no define cargos/i)).toBeInTheDocument();
  });

  it('creates a position with the trimmed name', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/directory/positions': () => json({ items: CATALOG }),
        'POST /tenant/directory/positions': () => json({ id: 'p3', name: 'Socio fundador', status: 'active' }, 201),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<PositionCatalogTable archetype="SA" />);

    await user.click(await screen.findByRole('button', { name: /nuevo cargo/i }));
    await user.type(screen.getByLabelText(/nombre del cargo/i), '  Socio fundador ');
    await user.click(screen.getByRole('button', { name: /crear cargo/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(JSON.parse(call![1].body as string)).toEqual({ name: 'Socio fundador' });
    });
  });

  it('refuses a duplicate name before sending it', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/directory/positions': () => json({ items: CATALOG }) }));
    const user = userEvent.setup();
    renderWithClient(<PositionCatalogTable archetype="SA" />);

    await user.click(await screen.findByRole('button', { name: /nuevo cargo/i }));
    await user.type(screen.getByLabelText(/nombre del cargo/i), 'asociado senior');
    await user.click(screen.getByRole('button', { name: /crear cargo/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya existe/i);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('"Retirar" confirms, then retires', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/directory/positions': () => json({ items: CATALOG }),
        'PATCH /tenant/directory/positions/p1/retire': () => json({ ...CATALOG[0], status: 'retired' }),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<PositionCatalogTable archetype="SA" />);

    const active = (await screen.findByText('Asociado Senior')).closest('tr')!;
    await user.click(within(active).getByRole('button', { name: /retirar/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /retirar cargo/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/p1/retire'))).toBe(true),
    );
  });
});
