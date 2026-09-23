/**
 * 014 T020 (US2). Changing a member's role.
 *
 * `membership.change_archetype` is SA-only (unlike the rest of the screen) and step-up gated.
 * The control is not drawn for an MP, and not for the firm's last SA, whose demotion would leave
 * the firm without an administrator (FR-012). The server refuses both anyway.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { ChangeArchetypeControl } from '@/app/configuracion/components/ChangeArchetypeDialog';
import type { Member } from '@/configuracion/types';
import { json, renderWithClient, route } from './helpers';

const SA: Member = { membershipId: 'm-sa', email: 'ana@despachoalfa.mx', archetype: 'SA', positionName: null };
const AA: Member = { membershipId: 'm-aa', email: 'lucia@despachoalfa.mx', archetype: 'AA', positionName: null };

describe('ChangeArchetypeControl', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('is rendered for an SA', () => {
    renderWithClient(<ChangeArchetypeControl archetype="SA" member={AA} all={[SA, AA]} />);
    expect(screen.getByRole('button', { name: /cambiar rol/i })).toBeInTheDocument();
  });

  it('is not rendered for an MP', () => {
    renderWithClient(<ChangeArchetypeControl archetype="MP" member={AA} all={[SA, AA]} />);
    expect(screen.queryByRole('button', { name: /cambiar rol/i })).not.toBeInTheDocument();
  });

  it('is disabled for the firm’s last SA', () => {
    renderWithClient(<ChangeArchetypeControl archetype="SA" member={SA} all={[SA, AA]} />);
    expect(screen.getByRole('button', { name: /cambiar rol/i })).toBeDisabled();
  });

  it('sends the new role with the step-up token', async () => {
    fetchMock.mockImplementation(
      route({
        'POST /auth/step-up': () => json({ stepUpToken: 'elev-4', expiresAt: 'x' }),
        'PATCH /tenant/memberships/m-aa/archetype': () => json({ id: 'm-aa', archetype: 'PL' }),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<ChangeArchetypeControl archetype="SA" member={AA} all={[SA, AA]} />);

    await user.click(screen.getByRole('button', { name: /cambiar rol/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.selectOptions(within(dialog).getByLabelText(/nuevo rol/i), 'PL');
    await user.click(within(dialog).getByRole('button', { name: /cambiar rol/i }));
    await user.type(await screen.findByLabelText(/código de seis dígitos/i), '123456');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/m-aa/archetype'));
      expect(call).toBeDefined();
      expect(JSON.parse(call![1].body as string)).toEqual({ archetype: 'PL' });
      expect((call![1].headers as Record<string, string>)['x-step-up-token']).toBe('elev-4');
    });
  });
});
