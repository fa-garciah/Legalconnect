/**
 * 014 T012 (US1). Inviting a person: the form, the step-up, the request.
 *
 * `invitation.issue` is step-up gated (005), so the order is fixed: the form validates, the
 * second factor is asked for, and only then is `POST /tenant/invitations` sent, with the token
 * as `x-step-up-token`. A refusal renders through `016a`'s classifier, never as a raw code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { InviteUserDialog } from '@/app/configuracion/components/InviteUserDialog';
import { json, renderWithClient, route } from './helpers';

const ISSUED = {
  id: 'inv-1',
  targetArchetype: 'AA',
  status: 'pending',
  issuedAt: '2026-09-23T18:00:00Z',
  expiresAt: '2026-09-30T18:00:00Z',
  invitationLink: '/aceptar/raw-token-abc',
};

describe('InviteUserDialog', () => {
  const fetchMock = vi.fn();
  const onIssued = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(issuer: 'SA' | 'MP' = 'SA') {
    return renderWithClient(
      <InviteUserDialog open issuerArchetype={issuer} onClose={onClose} onIssued={onIssued} />,
    );
  }

  async function fillAndSubmit(email = 'lucia@despachoalfa.mx', role = 'Abogado asociado') {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/correo/i), email);
    await user.selectOptions(screen.getByLabelText(/^rol/i), screen.getByRole('option', { name: role }));
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));
    return user;
  }

  it('offers an MP no SA role', () => {
    open('MP');
    expect(screen.queryByRole('option', { name: 'Administrador' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Socio' })).toBeInTheDocument();
  });

  it('validates before anything is sent', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for the second factor, then sends { email, targetArchetype } with the token', async () => {
    fetchMock.mockImplementation(
      route({
        'POST /auth/step-up': () => json({ stepUpToken: 'elev-1', expiresAt: 'x' }),
        'POST /tenant/invitations': () => json(ISSUED, 201),
      }),
    );
    open();
    const user = await fillAndSubmit();

    // The invitation is NOT sent before the code is confirmed.
    expect(await screen.findByRole('heading', { name: /verificación adicional/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/código de seis dígitos/i), '123456');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    await waitFor(() => expect(onIssued).toHaveBeenCalledWith(ISSUED));
    const invite = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/tenant/invitations'))!;
    expect(JSON.parse(invite[1].body as string)).toEqual({
      email: 'lucia@despachoalfa.mx',
      targetArchetype: 'AA',
    });
    expect((invite[1].headers as Record<string, string>)['x-step-up-token']).toBe('elev-1');
  });

  it('renders a refusal through the classifier, not as a raw code', async () => {
    fetchMock.mockImplementation(
      route({
        'POST /auth/step-up': () => json({ stepUpToken: 'elev-1', expiresAt: 'x' }),
        'POST /tenant/invitations': () => json({ error: { code: 'not_authorized', message: 'x' } }, 403),
      }),
    );
    open();
    const user = await fillAndSubmit();
    await user.type(await screen.findByLabelText(/código de seis dígitos/i), '123456');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    expect(await screen.findByTestId('error-state-copy')).toHaveTextContent(
      'Tu rol actual no permite esta acción.',
    );
    expect(screen.queryByText('not_authorized')).not.toBeInTheDocument();
    expect(onIssued).not.toHaveBeenCalled();
  });
});
