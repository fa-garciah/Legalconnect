/**
 * The authentication fields, and the rules the reference design broke that this product
 * cannot. Redesign of 2026-09-22 after a reference mock-up ("FiscalERP").
 *
 * Taken from the reference: a leading icon in each field and a show/hide control on
 * passwords. Refused from it, each for a stated reason:
 *   - "Recordarme": the constitution's Sessions section says, twice, `No "remember me"`.
 *   - "Continuar con Google": identity is self-hosted with MANDATORY TOTP (v1.5.0); a
 *     social provider would be a new identity path no spec describes.
 *   - "¿Olvidaste tu contraseña?": no password-reset flow exists, front or back. A link to
 *     it would be a control that cannot work.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Mail } from 'lucide-react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { IconField, PasswordField } from '@/app/(auth)/fields';
import { SignInForm } from '@/app/(auth)/ingresar/SignInForm';

describe('IconField', () => {
  it('keeps the label as the accessible name and hides the icon from assistive technology', () => {
    render(<IconField id="email" label="Correo electrónico" icon={Mail} type="email" />);
    const input = screen.getByLabelText('Correo electrónico');
    expect(input).toHaveAttribute('type', 'email');
    const icon = input.parentElement!.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('PasswordField', () => {
  it('starts hidden and reveals on request, saying so to a screen reader', () => {
    render(<PasswordField id="password" label="Contraseña" autoComplete="current-password" />);
    const input = screen.getByLabelText('Contraseña');
    expect(input).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);

    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('is a button that never submits the form', () => {
    render(<PasswordField id="password" label="Contraseña" autoComplete="current-password" />);
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute('type', 'button');
  });
});

describe('SignInForm refuses what the reference offered', () => {
  it('offers no "remember me" — the constitution forbids it for every role', () => {
    render(<SignInForm />);
    expect(screen.queryByText(/recordarme|mantener sesión/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('offers no social sign-in — identity is self-hosted with mandatory TOTP', () => {
    render(<SignInForm />);
    expect(screen.queryByText(/google|microsoft|apple/i)).not.toBeInTheDocument();
  });

  it('links to no password reset, because none exists', () => {
    render(<SignInForm />);
    expect(screen.queryByText(/olvidaste/i)).not.toBeInTheDocument();
  });
});
