/**
 * T051 — the credential screen. FR-049, FR-050, SC-005, SC-026.
 *
 * The assertion that carries the most weight is the ABSENCE one. A
 * "remember this device" checkbox here would be a constitution violation rather
 * than a UX choice — the document forbids the capability from being built, not
 * merely from being enabled — and an absence is the one thing a passing test can
 * be wrong about silently. So it is checked by several names, in both languages.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInForm } from '@/app/(auth)/ingresar/SignInForm';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

describe('SignInForm (T051)', () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('is in Spanish — every label and control (FR-049, SC-026)', () => {
    render(<SignInForm />);
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });

  it('HAS NO TRUSTED-DEVICE CONTROL OF ANY KIND (FR-019, SC-005)', () => {
    const { container } = render(<SignInForm />);
    // No checkbox at all — the control would have to be one.
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    // And no copy offering it, under any of the names it usually wears.
    const text = container.textContent?.toLowerCase() ?? '';
    for (const phrase of ['recordar', 'confiar', 'trusted', 'remember', 'no volver a pedir']) {
      expect(text).not.toContain(phrase);
    }
  });

  it('shows ONE refusal message, whatever the cause (SC-017)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    render(<SignInForm />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'persona@despacho.mx');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una-contrasena');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    const alert = await screen.findByRole('alert');
    // Nothing about whether the account exists, is locked, or has a factor.
    for (const leak of ['existe', 'bloque', 'contraseña incorrecta', 'usuario']) {
      expect(alert.textContent?.toLowerCase()).not.toContain(leak);
    }
  });

  it('routes to the challenge when the API says next=factor', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ challengeToken: 'opaque-token', next: 'factor' }),
    } as Response);
    render(<SignInForm />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'persona@despacho.mx');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una-contrasena');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/verificar?reto=opaque-token'));
  });

  it('routes to enrollment when the identity has no confirmed factor (FR-006)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ challengeToken: 'opaque-token', next: 'enrollment' }),
    } as Response);
    render(<SignInForm />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'nuevo@despacho.mx');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una-contrasena');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/enrolar?reto=opaque-token'));
  });

  it('WRITES NOTHING TO BROWSER STORAGE (FR-051, SC-028)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ challengeToken: 'opaque-token', next: 'factor' }),
    } as Response);
    render(<SignInForm />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'persona@despacho.mx');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta-larga');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('reaches every control by keyboard alone', async () => {
    render(<SignInForm />);
    await userEvent.tab();
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Continuar' })).toHaveFocus();
  });
});
