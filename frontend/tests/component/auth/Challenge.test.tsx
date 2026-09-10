/**
 * T051 — the challenge screen. FR-019, FR-049, FR-050, SC-005, SC-026.
 *
 * The second half of the absence assertion. If a trusted-device control were
 * ever going to appear anywhere, it would appear here — this is the screen a
 * person sees on every single sign-in, and the one where the friction the
 * constitution deliberately accepts is actually felt.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChallengeForm } from '@/app/(auth)/verificar/ChallengeForm';

const push = vi.fn();
const refresh = vi.fn();
const signIn = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams('reto=opaque-challenge-token'),
}));
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

describe('ChallengeForm (T051)', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    signIn.mockReset();
  });

  it('is in Spanish (FR-049, SC-026)', () => {
    render(<ChallengeForm />);
    expect(screen.getByText('Código de verificación')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeInTheDocument();
  });

  it('HAS NO TRUSTED-DEVICE CONTROL — this is the screen where one would appear', () => {
    const { container } = render(<ChallengeForm />);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    const text = container.textContent?.toLowerCase() ?? '';
    for (const phrase of ['recordar', 'confiar', 'trusted', 'remember', 'no volver a pedir', '30 días']) {
      expect(text).not.toContain(phrase);
    }
  });

  it('will not submit until six digits are present', () => {
    render(<ChallengeForm />);
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeDisabled();
  });

  it('hands the code to NextAuth, never verifying it here (D1)', async () => {
    signIn.mockResolvedValue({ error: undefined });
    render(<ChallengeForm />);

    await userEvent.type(screen.getByRole('textbox'), '492013');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith('legalconnect', {
        challengeToken: 'opaque-challenge-token',
        code: '492013',
        redirect: false,
      }),
    );
  });

  it('shows the SAME refusal the credential step shows, and clears the code', async () => {
    signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    render(<ChallengeForm />);

    await userEvent.type(screen.getByRole('textbox'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    const alert = await screen.findByRole('alert');
    // Nothing about lockouts, expiry, replay or keys — the API refuses all of
    // them identically and the screen must not undo that.
    for (const leak of ['bloque', 'expir', 'reintent', 'llave', 'código incorrecto']) {
      expect(alert.textContent?.toLowerCase()).not.toContain(leak);
    }
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  });

  it('offers the backup-code path rather than stranding a person without their phone', async () => {
    render(<ChallengeForm />);
    const link = screen.getByRole('link', { name: /código de respaldo/i });
    expect(link).toHaveAttribute('href', '/recuperar');
  });

  it('WRITES NOTHING TO BROWSER STORAGE (FR-051, SC-028)', async () => {
    signIn.mockResolvedValue({ error: undefined });
    render(<ChallengeForm />);

    await userEvent.type(screen.getByRole('textbox'), '492013');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
