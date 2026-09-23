/**
 * The frame every authentication screen sits in. `020-design-language`, FR-010.
 *
 * FR-010 requires the four authentication screens to carry the product's identity — they are
 * the first thing a firm sees — and until now they were a plain card with a sans title on a
 * grey ground. The frame now reads, at a glance, as a legal-and-fiscal system for Mexican
 * firms: a brand panel with a stylised fiscal voucher (RFC, folio fiscal, régimen) beside the
 * form.
 *
 * Two constraints are asserted rather than trusted:
 *   - the voucher is DECORATION and is hidden from assistive technology, so a screen-reader
 *     user is not read a fake RFC and a fake UUID before the actual form;
 *   - every claim the panel makes in words is one the product already honours. Invoicing and
 *     CFDI stamping are not built (slice 011 does not exist; the PAC is still [PENDING]), so
 *     the copy must not promise them.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthCard } from '@/app/(auth)/AuthCard';

function renderCard(): void {
  render(
    <AuthCard title="Ingresar" description="Ingresa tu correo y contraseña para continuar.">
      <form aria-label="formulario">
        <button type="submit">Continuar</button>
      </form>
    </AuthCard>,
  );
}

describe('AuthCard', () => {
  it('names the screen in the display serif — FR-010', () => {
    renderCard();
    const heading = screen.getByRole('heading', { level: 1, name: 'Ingresar' });
    expect(heading.className).toMatch(/font-display/);
  });

  it('still renders the form it frames', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });

  it('shows the fiscal voucher, hidden from assistive technology', () => {
    renderCard();
    const voucher = screen.getByTestId('auth-fiscal-voucher');
    expect(voucher).toHaveAttribute('aria-hidden', 'true');
    expect(voucher.textContent).toMatch(/RFC/);
    expect(voucher.textContent).toMatch(/Folio fiscal/);
  });

  it('claims only what the product already does — no invoicing or stamping promises', () => {
    renderCard();
    const panel = screen.getByTestId('auth-brand-panel');
    // Text a reader is actually told, excluding the decorative voucher.
    const claims = [...panel.querySelectorAll('[data-claim]')].map((n) => n.textContent ?? '');
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      // Word-bounded: an unbounded, case-insensitive `pac` matches inside "des-PAC-hos",
      // which is how the first version of this assertion failed a sentence making no claim.
      expect(claim).not.toMatch(/\b(timbr\w*|factur\w*|CFDI|PAC)\b/i);
    }
  });

  it('keeps small panel text off the ochre, which reads only 3.03:1 on indigo', () => {
    // Found by `design:design-critique` on 2026-09-22: the positioning line was ochre on
    // indigo at 11.5px, which needs 4.5:1. Ochre stays for the icons, where 3:1 suffices.
    renderCard();
    const panel = screen.getByTestId('auth-brand-panel');
    for (const node of panel.querySelectorAll('p, h2, span[data-claim]')) {
      expect(node.className).not.toMatch(/\btext-accent-warm\b/);
    }
  });

  it('renders an optional link in the top corner, as the reference places it', () => {
    render(
      <AuthCard title="Ingresar" description="d" topLink={<a href="/ingresar">Inicia sesión</a>}>
        <span />
      </AuthCard>,
    );
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toBeInTheDocument();
  });
});
