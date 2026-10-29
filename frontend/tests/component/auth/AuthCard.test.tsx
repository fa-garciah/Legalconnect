/**
 * The frame every authentication screen sits in. `020-design-language`, FR-010.
 *
 * FR-010 requires the four authentication screens to carry the product's identity — they are
 * the first thing a firm sees. The panel shows a case-file cover (carátula): the file number,
 * the kind of proceeding and the parties, which is the object the product is built around.
 *
 * It replaced a stylised fiscal voucher on 2026-10-29. The voucher was the largest thing on the
 * first screen and showed an RFC, a folio fiscal and a total — invoicing that is not built
 * (slice 011 does not exist; the PAC is still [PENDING]). The `data-claim` check below could not
 * see it, because decoration carried no `data-claim`: the strongest promise on the page was
 * exactly the one the test did not read. So the promise check now reads the WHOLE panel.
 *
 * Constraints asserted rather than trusted:
 *   - the cover is DECORATION and is hidden from assistive technology, so a screen-reader user
 *     is not read a fictitious file number and fictitious parties before the actual form;
 *   - nothing on the panel, decoration included, promises invoicing or stamping;
 *   - no eyebrow: no uppercase, letter-spaced label above the headline (craft floor ban).
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

  it('shows a case-file cover, hidden from assistive technology', () => {
    renderCard();
    const cover = screen.getByTestId('auth-case-cover');
    expect(cover).toHaveAttribute('aria-hidden', 'true');
    expect(cover.textContent).toMatch(/EXP-\d{4}-\d{4}/);
    expect(cover.textContent).toMatch(/Actor/);
    expect(cover.textContent).toMatch(/Demandado/);
  });

  it('promises no invoicing or stamping anywhere on the panel, decoration included', () => {
    renderCard();
    const panel = screen.getByTestId('auth-brand-panel');
    expect(panel.querySelectorAll('[data-claim]').length).toBeGreaterThan(0);
    // Word-bounded: an unbounded, case-insensitive `pac` matches inside "des-PAC-hos", which is
    // how the first version of this assertion failed a sentence making no claim.
    expect(panel.textContent).not.toMatch(
      /\b(timbr\w*|factur\w*|CFDI|PAC|fiscal\w*|ERP)\b/i,
    );
  });

  it('carries no eyebrow — no uppercase, letter-spaced label anywhere in the frame', () => {
    const { container } = render(
      <AuthCard title="Ingresar" description="d">
        <span />
      </AuthCard>,
    );
    for (const node of container.querySelectorAll('*')) {
      const className = typeof node.className === 'string' ? node.className : '';
      expect(className).not.toMatch(/\buppercase\b/);
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
