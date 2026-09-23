/**
 * 014 T022 (US2). Giving a member a position (017 `directory.assign_position`).
 *
 * Only ACTIVE positions are offered: a retired one cannot be newly assigned (017). "Sin cargo"
 * clears it. Not step-up gated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { AssignPositionControl } from '@/app/configuracion/components/AssignPositionDialog';
import type { Member } from '@/configuracion/types';
import { json, renderWithClient, route } from './helpers';

const AA: Member = { membershipId: 'm-aa', email: 'lucia@despachoalfa.mx', archetype: 'AA', positionName: null };
const CATALOG = [
  { id: 'p1', name: 'Asociado Senior', status: 'active' },
  { id: 'p2', name: 'Pasante de verano', status: 'retired' },
];

describe('AssignPositionControl', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('is not rendered without directory.assign_position', () => {
    renderWithClient(<AssignPositionControl archetype="AA" member={AA} />);
    expect(screen.queryByRole('button', { name: /asignar cargo/i })).not.toBeInTheDocument();
  });

  it('offers active positions only, plus "Sin cargo"', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/directory/positions': () => json({ items: CATALOG }) }));
    const user = userEvent.setup();
    renderWithClient(<AssignPositionControl archetype="SA" member={AA} />);

    await user.click(screen.getByRole('button', { name: /asignar cargo/i }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText(/^cargo/i);
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Asociado Senior' })).toBeInTheDocument());
    expect(within(select).queryByRole('option', { name: 'Pasante de verano' })).not.toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Sin cargo' })).toBeInTheDocument();
  });

  it('calls PATCH /tenant/directory/entries/{membershipId}/position', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/directory/positions': () => json({ items: CATALOG }),
        'PATCH /tenant/directory/entries/m-aa/position': () => json({ membershipId: 'm-aa', positionId: 'p1' }),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<AssignPositionControl archetype="MP" member={AA} />);

    await user.click(screen.getByRole('button', { name: /asignar cargo/i }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText(/^cargo/i);
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Asociado Senior' })).toBeInTheDocument());
    await user.selectOptions(select, 'p1');
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(String(call![0])).toBe('/api/lc/tenant/directory/entries/m-aa/position');
      expect(JSON.parse(call![1].body as string)).toEqual({ positionId: 'p1' });
    });
  });
});
