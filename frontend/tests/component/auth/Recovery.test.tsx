/**
 * T086 — the recovery screen. FR-049, FR-050.
 *
 * Reached from the challenge screen rather than as a separate flow, which is
 * the structural claim: a person here has already proved their credential, and
 * what they have lost is their authenticator. A distinct entry point would mean
 * either asking for the credential twice or accepting a backup code without
 * one, and the second turns a printout into a master key.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveryForm } from '@/app/(auth)/recuperar/RecoveryForm';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('reto=opaque-challenge-token'),
}));

describe('RecoveryForm (T086)', () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
    sessionStorage.clear();
  });

  it('is in Spanish (FR-049, SC-026)', () => {
    render(<RecoveryForm />);
    expect(screen.getByLabelText('Código de respaldo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });

  it('tells the person what happens next, before they spend a code', () => {
    // A backup code is one of ten and cannot be got back. Saying "you will
    // register a new authenticator and receive new codes" before the button is
    // pressed is the difference between a recovery and a surprise.
    render(<RecoveryForm />);
    expect(screen.getByText(/nueva aplicación de autenticación/i)).toBeInTheDocument();
    expect(screen.getByText(/una sola vez/i)).toBeInTheDocument();
  });

  it('HANDS TO RE-ENROLLMENT, NOT TO A SESSION (FR-027)', async () => {
    // The assertion the whole flow turns on. If this navigated to the
    // dashboard, a written-down code would be worth exactly as much as the
    // second factor it replaces.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ enrollmentToken: 'new-token', next: 'reenrollment', remainingCodes: 9 }),
    } as Response);

    render(<RecoveryForm />);
    await userEvent.type(screen.getByLabelText('Código de respaldo'), '4F2A9-1BD7C-03E5F');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/enrolar?reto=new-token'));
    // Never the dashboard.
    expect(push).not.toHaveBeenCalledWith('/');
  });

  it('presents the same uniform refusal, and clears the field', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);

    render(<RecoveryForm />);
    const field = screen.getByLabelText('Código de respaldo');
    await userEvent.type(field, 'ZZZZZ-ZZZZZ-ZZZZZ');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    const alert = await screen.findByRole('alert');
    // Nothing about how many codes remain, whether this one existed, or
    // whether the account is locked.
    for (const leak of ['restan', 'quedan', 'bloque', 'inv[aá]lido']) {
      expect(alert.textContent?.toLowerCase()).not.toMatch(new RegExp(leak));
    }
    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('will not submit an empty code', () => {
    render(<RecoveryForm />);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });

  it('WRITES NOTHING TO BROWSER STORAGE (FR-051, SC-028)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ enrollmentToken: 'new-token', next: 'reenrollment', remainingCodes: 9 }),
    } as Response);

    render(<RecoveryForm />);
    await userEvent.type(screen.getByLabelText('Código de respaldo'), '4F2A9-1BD7C-03E5F');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
