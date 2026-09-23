/**
 * Accepting an invitation — the product's only way to "create an account".
 *
 * The reference design had "Crear una cuenta" as open sign-up. This product has none by
 * design: a firm invites a person (002), and the person sets their credential when they
 * accept (003/FR-053). `proxy.ts` has listed `/aceptar` as a public path since 003, and the
 * page behind it never existed — so the only way to make a user was a script. This is that
 * page, in the new frame.
 *
 * What it does NOT ask for, and why: a name (the accept contract takes email and credential
 * only), and a terms checkbox (there is no terms document to link to).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { AcceptInvitationForm } from '@/app/(auth)/aceptar/[referencia]/AcceptInvitationForm';

const upstream = vi.fn();

function fill(email: string, password: string, confirm: string): void {
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirma tu contraseña'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: /crear mi acceso/i }));
}

describe('AcceptInvitationForm', () => {
  beforeEach(() => {
    push.mockReset();
    upstream.mockReset().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', upstream);
  });

  it('refuses mismatched passwords without calling the API', async () => {
    render(<AcceptInvitationForm reference="ref-123" />);
    fill('ana@despacho.mx', 'una-contrasena-larga', 'otra-contrasena-larga');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no coinciden/i);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('refuses a password under the 12-character floor the API enforces', async () => {
    render(<AcceptInvitationForm reference="ref-123" />);
    fill('ana@despacho.mx', 'corta', 'corta');
    expect(await screen.findByRole('alert')).toHaveTextContent(/12 caracteres/);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('accepts through the contract route, then sends the person to sign in', async () => {
    render(<AcceptInvitationForm reference="ref-123" />);
    fill('ana@despacho.mx', 'una-contrasena-larga', 'una-contrasena-larga');

    await waitFor(() => expect(upstream).toHaveBeenCalled());
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toContain('/identity/invitations/ref-123/accept');
    expect(JSON.parse(init.body)).toEqual({ email: 'ana@despacho.mx', credential: 'una-contrasena-larga' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/ingresar?invitacion=aceptada'));
  });

  it('gives one opaque refusal for every failure, as the contract does', async () => {
    // 002's contract answers 400 for an unknown, expired, used or revoked reference AND for
    // an email mismatch, deliberately indistinguishable (FR-028). The screen must not undo
    // that by guessing which one happened.
    upstream.mockResolvedValue(new Response('{}', { status: 400 }));
    render(<AcceptInvitationForm reference="ref-123" />);
    fill('ana@despacho.mx', 'una-contrasena-larga', 'una-contrasena-larga');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no fue posible aceptar/i);
    expect(alert).not.toHaveTextContent(/expir|correo no coincide|ya fue usada/i);
    expect(push).not.toHaveBeenCalled();
  });

  it('asks for no name and no terms — the contract takes email and credential only', () => {
    render(<AcceptInvitationForm reference="ref-123" />);
    expect(screen.queryByLabelText(/nombre/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
