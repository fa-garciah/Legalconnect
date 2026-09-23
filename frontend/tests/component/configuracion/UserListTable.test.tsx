/**
 * 014 T015 (US1). The firm's members.
 *
 * Email comes from `GET /tenant/members` (Decision 5). If that is unavailable the list falls
 * back to the directory and says why there is no email, rather than rendering UUIDs. The firm's
 * last `SA` is never offered "Desactivar": the server refuses it too, but a control that can
 * only fail is not worth drawing (FR-012).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { UserListTable } from '@/app/configuracion/components/UserListTable';
import { json, renderWithClient, route } from './helpers';

const MEMBERS = [
  { membershipId: 'm-sa', email: 'ana@despachoalfa.mx', archetype: 'SA', positionName: null },
  { membershipId: 'm-aa', email: 'lucia@despachoalfa.mx', archetype: 'AA', positionName: 'Asociado Senior' },
];

describe('UserListTable', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows each member’s email, role and position', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/members': () => json({ items: MEMBERS }) }));
    renderWithClient(<UserListTable archetype="SA" />);

    const row = (await screen.findByText('lucia@despachoalfa.mx')).closest('tr')!;
    expect(within(row).getByText('Abogado asociado')).toBeInTheDocument();
    expect(within(row).getByText('Asociado Senior')).toBeInTheDocument();
  });

  it('falls back to the directory, labelled "Correo no disponible", never a UUID', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/members': () => json({ error: { code: 'not_authorized', message: 'x' } }, 403),
        'GET /tenant/directory': () =>
          json({
            items: [{ membershipId: 'm-aa', archetype: 'AA', positionId: 'p1', positionName: 'Asociado Senior' }],
            nextCursor: null,
          }),
      }),
    );
    renderWithClient(<UserListTable archetype="SA" />);

    expect(await screen.findByText('Asociado Senior')).toBeInTheDocument();
    expect(screen.getAllByText(/correo no disponible/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('m-aa')).not.toBeInTheDocument();
  });

  it('the last SA is offered no "Desactivar"; other members are', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/members': () => json({ items: MEMBERS }) }));
    renderWithClient(<UserListTable archetype="SA" />);

    const saRow = (await screen.findByText('ana@despachoalfa.mx')).closest('tr')!;
    const aaRow = screen.getByText('lucia@despachoalfa.mx').closest('tr')!;
    expect(within(saRow).queryByRole('button', { name: /desactivar/i })).not.toBeInTheDocument();
    expect(within(aaRow).getByRole('button', { name: /desactivar/i })).toBeInTheDocument();
  });

  it('an SA is offered "Desactivar" when another SA remains', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/members': () =>
          json({
            items: [
              ...MEMBERS,
              { membershipId: 'm-sa2', email: 'beto@despachoalfa.mx', archetype: 'SA', positionName: null },
            ],
          }),
      }),
    );
    renderWithClient(<UserListTable archetype="SA" />);
    const saRow = (await screen.findByText('ana@despachoalfa.mx')).closest('tr')!;
    expect(within(saRow).getByRole('button', { name: /desactivar/i })).toBeInTheDocument();
  });

  it('"Desactivar" confirms, asks for the second factor, then revokes with the token', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/members': () => json({ items: MEMBERS }),
        'POST /auth/step-up': () => json({ stepUpToken: 'elev-3', expiresAt: 'x' }),
        'PATCH /tenant/memberships/m-aa/revoke': () => json({ id: 'm-aa', status: 'revoked' }),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<UserListTable archetype="SA" />);

    const aaRow = (await screen.findByText('lucia@despachoalfa.mx')).closest('tr')!;
    await user.click(within(aaRow).getByRole('button', { name: /desactivar/i }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(/lucia@despachoalfa\.mx/);
    await user.click(within(confirm).getByRole('button', { name: /desactivar acceso/i }));
    await user.type(await screen.findByLabelText(/código de seis dígitos/i), '123456');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    await waitFor(() => {
      const revoke = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/m-aa/revoke'));
      expect(revoke).toBeDefined();
      expect((revoke![1].headers as Record<string, string>)['x-step-up-token']).toBe('elev-3');
    });
  });

  it('offers no "Desactivar" to an archetype without membership.revoke', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/members': () => json({ items: MEMBERS }) }));
    renderWithClient(<UserListTable archetype="AA" />);
    await screen.findByText('lucia@despachoalfa.mx');
    expect(screen.queryByRole('button', { name: /desactivar/i })).not.toBeInTheDocument();
  });
});
