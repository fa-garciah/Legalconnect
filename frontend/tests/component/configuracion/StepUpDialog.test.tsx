/**
 * 014 T009e (FR-026). The step-up prompt the administration screen shows before a gated action.
 *
 * `005` gates four of the mutations on `/configuracion` behind a fresh second factor
 * (`invitation.issue`, `invitation.revoke`, `membership.revoke`, `membership.change_archetype`).
 * The API answers `403 step_up_required` without `x-step-up-token`, and it takes the token from
 * `POST /auth/step-up { capability, code }`. This dialog is that exchange and nothing else: it
 * returns the token to the caller, which sends the gated request itself.
 *
 * A refused code shows `005`'s uniform refusal — which check failed is deliberately not said
 * (005/FR-020) — and resolves nothing, so the gated request is never sent on a failed code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { StepUpDialog } from '@/app/configuracion/components/StepUpDialog';
import type { StepUpCapability } from '@/configuracion/step-up';

function respondWith(body: unknown, status = 200): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );
}

describe('StepUpDialog', () => {
  const fetchMock = vi.fn();
  const onVerified = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(capability: StepUpCapability = 'invitation.issue') {
    return render(
      <StepUpDialog open capability={capability} onVerified={onVerified} onCancel={onCancel} />,
    );
  }

  it('asks for the six-digit code of the authenticator app', () => {
    open();
    expect(screen.getByRole('heading', { name: /verificación adicional/i })).toBeInTheDocument();
    const field = screen.getByLabelText(/código de seis dígitos/i);
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('does not send until six digits are entered', async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText(/código de seis dígitos/i), '123');
    expect(screen.getByRole('button', { name: /verificar/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts { capability, code } to /auth/step-up through the proxy and resolves with the token', async () => {
    fetchMock.mockImplementation(
      respondWith({ stepUpToken: 'elevation-abc', expiresAt: '2026-09-23T18:06:00Z' }),
    );
    const user = userEvent.setup();
    open('membership.revoke');

    await user.type(screen.getByLabelText(/código de seis dígitos/i), '492013');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('elevation-abc'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/lc/auth/step-up');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ capability: 'membership.revoke', code: '492013' });
  });

  it('a refused code shows the uniform refusal and resolves nothing', async () => {
    fetchMock.mockImplementation(
      respondWith({ error: 'authentication_failed', message: 'No fue posible completar el acceso.' }, 401),
    );
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText(/código de seis dígitos/i), '000000');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no fue posible verificar el código/i);
    expect(onVerified).not.toHaveBeenCalled();
    // The field is cleared for the next attempt; the refused code is not left in it.
    expect(screen.getByLabelText(/código de seis dígitos/i)).toHaveValue('');
  });

  it('a network failure says so, and resolves nothing', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText(/código de seis dígitos/i), '123456');
    await user.click(screen.getByRole('button', { name: /verificar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no fue posible conectar/i);
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('cancelling sends nothing and tells the caller', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
