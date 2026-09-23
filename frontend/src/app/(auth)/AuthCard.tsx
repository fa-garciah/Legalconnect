/**
 * The frame every authentication screen sits in — sign-in, the second factor, enrollment,
 * recovery and invitation acceptance. `020-design-language`, FR-010.
 *
 * Deliberately NOT the shell. A person here has no principal, so `Header`,
 * `NavigationMenu` and `TenantSwitcher` have nothing to render from — which is why the root
 * layout skips the shell for these routes and why this frame exists instead.
 *
 * LAYOUT FROM A REFERENCE, IDENTITY FROM `020`. The structure follows a reference mock-up
 * reviewed on 2026-09-22 — a deep brand panel on the left, a clean form column on the right —
 * and was then pared back on 2026-09-23 to the essentials: wordmark, one positioning line,
 * one headline, the voucher, and a single quiet line of guarantees. The palette, the two families and the no-literal rule are `020`'s and are not
 * reopened: the reference's bright blue is our indigo, its sans headings are our serif.
 *
 * WHAT THE REFERENCE PROMISED AND THIS DOES NOT. Its feature list read "Facturación CFDI 4.0 /
 * Contabilidad / Inventarios". None of that exists here — slice 011 is unbuilt and the PAC is
 * still [PENDING] — so every sentence marked `data-claim` is something the product ALREADY
 * does, and `AuthCard.test.tsx` fails if one starts promising invoicing or stamping. The
 * fiscal register is carried by the voucher instead, which is decoration and `aria-hidden`.
 *
 * Small text on the panel is `primary-foreground`, never ochre: ochre on indigo is 3.03:1,
 * below the 4.5:1 small text needs (found by `design:design-critique`). Ochre is kept for
 * icons and the rule, where 3:1 is the requirement.
 */
import type { ReactNode } from 'react';

/**
 * Claims the panel makes in words. Each one is true of the product today. Kept to three short
 * phrases on one line at the foot of the panel: a sign-in screen is not a brochure, and the
 * 2026-09-23 pass cut everything that competed with the form.
 */
const CLAIMS = ['RFC con formato SAT', 'Bitácora inmutable', 'Verificación en dos pasos'] as const;

function Wordmark({ inverted = false }: { inverted?: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          inverted ? 'bg-primary-foreground' : 'bg-primary'
        }`}
      >
        <span className="h-3.5 w-3.5 rounded-full bg-accent-warm" />
      </span>
      <span
        className={`font-display text-2xl font-semibold tracking-tight ${
          inverted ? 'text-primary-foreground' : 'text-primary'
        }`}
      >
        LegalConnect <span className={inverted ? 'opacity-70' : 'text-foreground'}>MX</span>
      </span>
    </div>
  );
}

/**
 * A stylised fiscal voucher. Decoration only. The values are fictitious: the issuer is the
 * local seed firm's RFC and the receiver is the SAT's generic "público en general" RFC, which
 * by definition names nobody. The total is deliberately a `heading` step, not `display` — at
 * display size it was the loudest element on the screen and pulled the eye off the form.
 */
function FiscalVoucher(): React.JSX.Element {
  const rows = [
    ['RFC emisor', 'DAL091203AB1'],
    ['RFC receptor', 'XAXX010101000'],
  ] as const;

  return (
    <div
      aria-hidden="true"
      data-testid="auth-fiscal-voucher"
      className="w-full max-w-xs rounded-xl bg-card p-5 text-card-foreground shadow-2xl ring-1 ring-primary-foreground/10"
    >
      <p className="border-b border-dashed pb-2 text-caption font-semibold tracking-widest text-muted-foreground uppercase">
        Comprobante fiscal
      </p>
      <dl className="mt-2 space-y-1 text-caption">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-caption text-muted-foreground">Folio fiscal</p>
      <p className="tabular font-mono text-caption">5F3C2A9E-7B41-4D0C-9A62-1E8B4F7D2C90</p>
      <div className="mt-2 flex items-baseline justify-between border-t pt-2">
        <span className="text-caption text-muted-foreground">Total</span>
        <span className="tabular font-display text-heading font-semibold">$18,560.00</span>
      </div>
    </div>
  );
}

function BrandPanel(): React.JSX.Element {
  return (
    <aside
      data-testid="auth-brand-panel"
      className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex"
    >
      {/* Ledger ruling, the paper a register is kept on. currentColor, never a literal. */}
      <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.06]">
        <defs>
          <pattern id="ledger" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M0 27.5H28M27.5 0V28" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ledger)" />
      </svg>
      <div className="relative flex w-full flex-col justify-between px-12 py-10 xl:px-16">
        <Wordmark inverted />

        <div className="space-y-10">
          <div className="space-y-4">
            <p className="text-caption font-semibold tracking-[0.2em] uppercase opacity-70">
              ERP legal y fiscal
            </p>
            <h2 className="max-w-md font-display text-hero leading-[1.1] font-semibold tracking-tight">
              La operación de tu despacho, en orden.
            </h2>
          </div>
          <FiscalVoucher />
        </div>

        <p className="flex flex-wrap gap-x-3 gap-y-1 text-caption opacity-70">
          {CLAIMS.map((claim, index) => (
            <span key={claim} className="flex items-center gap-3">
              {index > 0 ? <span aria-hidden>·</span> : null}
              <span data-claim>{claim}</span>
            </span>
          ))}
        </p>
      </div>
    </aside>
  );
}

export function AuthCard({
  title,
  description,
  topLink,
  notice,
  children,
}: {
  title: string;
  description: string;
  /** The reference places a secondary route ("¿Ya tienes acceso? …") in the top corner. */
  topLink?: ReactNode;
  /** A one-line status above the form — an expired session, an accepted invitation. */
  notice?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <BrandPanel />

      <section className="flex flex-col bg-card px-4 py-8 sm:px-10 lg:px-16">
        <div className="flex min-h-6 justify-end text-small text-muted-foreground">{topLink}</div>

        <div className="flex flex-1 flex-col items-center justify-center py-10">
          {/* Below `lg` the panel is gone, so the product still names itself — and still says
              what it is, which is the whole point of FR-010 for a screen seen on a phone. */}
          <div className="mb-10 flex flex-col items-center gap-2 text-center lg:hidden">
            <Wordmark />
            <p className="text-caption font-semibold tracking-[0.2em] text-accent-warm-foreground uppercase">
              ERP legal y fiscal para despachos
            </p>
          </div>

          <div className="w-full max-w-md space-y-7">
            <header className="space-y-2">
              <h1 className="font-display text-display leading-tight font-semibold tracking-tight">
                {title}
              </h1>
              <p className="text-body text-muted-foreground">{description}</p>
            </header>

            {notice}
            {children}
          </div>
        </div>

      </section>
    </main>
  );
}
