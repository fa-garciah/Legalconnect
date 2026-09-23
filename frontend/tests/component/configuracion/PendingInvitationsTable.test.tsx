/**
 * 014 T014 (US1). The firm's pending invitations, and revoking one.
 *
 * `invitation.revoke` is step-up gated and revoking cannot be undone (a new link must be
 * issued), so the order is: confirm, second factor, request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { PendingInvitationsTable } from '@/app/configuracion/components/PendingInvitationsTable';
import { json, renderWithClient, route } from './helpers';

const PENDING = {
  id: 'inv-1',
  targetArchetype: 'AA',
  status: 'pending',
  issuedAt: '2026-09-23T18:00:00Z',
  expiresAt: '2026-09-30T18:00:00Z',
  invitedEmail: 'lucia@despachoalfa.mx',
};

describe('PendingInvitationsTable', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows email, role, issue and expiry dates', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/invitations': () => json({ items: [PENDING] }) }));
    renderWithClient(<PendingInvitationsTable archetype="SA" />);

    const row = (await screen.findByText('lucia@despachoalfa.mx')).closest('tr')!;
    expect(within(row).getByText('Abogado asociado')).toBeInTheDocument();
    expect(within(row).getByText(/23 .*sep.* 2026/i)).toBeInTheDocument();
    expect(within(row).getByText(/30 .*sep.* 2026/i)).toBeInTheDocument();
  });

  it('says so when nothing is pending', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/invitations': () => json({ items: [] }) }));
    renderWithClient(<PendingInvitationsTable archetype="SA" />);
    expect(await screen.findByText(/no hay invitaciones pendientes/i)).toBeInTheDocument();
  });

  it('"Revocar" asks for confirmation before anything is sent', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/invitations': () => json({ items: [PENDING] }) }));
    const user = userEvent.setup();
    renderWithClient(<PendingInvitationsTable archetype="SA" />);

    await user.click(await screen.findByRole('button', { name: /^revocar/i }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/lucia@despachoalfa\.mx/);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('confirm, second factor, then revoke with the token', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/invitations': () => json({ items: [PENDING] }),
        'POST /auth/step-up': () => json({ stepUpToken: 'elev-2', expiresAt: 'x' }),
        'POST /tenant/invitations/inv-1/revoke': () => json({ ...PENDING, status: 'revoked' }),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<PendingInvitationsTable archetype="SA" />);

    await user.click(await screen.findByRole('button', { name: /^revocar/i }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: /revocar invitación/i }),
    );
    await user.type(await screen.findByLabelText(/código de seis dígitos/i), '123456');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    await waitFor(() => {
      const revoke = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/inv-1/revoke'));
      expect(revoke).toBeDefined();
      expect((revoke![1].headers as Record<string, string>)['x-step-up-token']).toBe('elev-2');
    });
  });

  it('offers no "Revocar" to an archetype without invitation.revoke', async () => {
    fetchMock.mockImplementation(route({ 'GET /tenant/invitations': () => json({ items: [PENDING] }) }));
    renderWithClient(<PendingInvitationsTable archetype="AA" />);
    await screen.findByText('lucia@despachoalfa.mx');
    expect(screen.queryByRole('button', { name: /^revocar/i })).not.toBeInTheDocument();
  });
});
