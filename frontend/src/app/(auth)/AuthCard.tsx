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
 * and was then pared back on 2026-09-23 to the essentials: wordmark, one headline, one object
 * and a single quiet line of guarantees. The palette, the two families and the no-literal rule
 * are `020`'s and are not reopened: the reference's bright blue is our indigo, its sans headings
 * are our serif.
 *
 * THE OBJECT IS A CASE-FILE COVER (2026-10-29). Until then it was a stylised fiscal voucher —
 * RFC, folio fiscal, a total — under an "ERP legal y fiscal" eyebrow: the largest thing on the
 * first screen promised invoicing, and slice 011 is unbuilt with the PAC still [PENDING]. The
 * cover shows what the product is built around instead: the file number, the proceeding and the
 * parties, the first thing a lawyer looks for. `AuthCard.test.tsx` now reads the WHOLE panel for
 * invoicing words, decoration included, because the old check read only `data-claim` and the
 * voucher was exactly what it could not see.
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
 * A case-file cover (carátula), the way the paper one sits on the front of the folder: the file
 * number large, the proceeding under it, then the parties on ruled lines like a printed form.
 * Decoration only, so `aria-hidden`. Every value is fictitious and comes from the local demo seed
 * (`backend/drizzle/demo`), which names no real firm or person.
 *
 * Manila from `accent-warm-tint`, the clasp in ochre: both tokens `020` already decided, so the
 * object adds no colour. The file number takes the display serif with tabular figures, the same
 * voice it has on the case register — the cover is the product's own identifier, drawn large.
 */
function CaseCover(): React.JSX.Element {
  const parties = [
    ['Actor', 'Tecnologías Núcleo Sur, S.A.P.I. de C.V.'],
    ['Demandado', 'Servicios Médicos Valdivia, S.C.'],
    ['Responsable', 'Lic. Laura Ramírez Ibarra'],
  ] as const;

  return (
    <div
      aria-hidden="true"
      data-testid="auth-case-cover"
      className="relative w-full max-w-lg rounded-lg bg-accent-warm-tint px-10 pt-10 pb-8 text-foreground shadow-2xl"
    >
      {/* The folder's clasp, centred on the top edge. */}
      <span className="absolute top-3 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-accent-warm" />
      <p className="text-small text-muted-foreground">Expediente</p>
      <p className="tabular font-display text-display leading-tight font-semibold tracking-tight">
        EXP-2026-2040
      </p>
      <p className="mt-1 text-small">Juicio ordinario mercantil</p>
      <dl className="mt-6 text-small">
        {parties.map(([label, value]) => (
          <div key={label} className="flex gap-4 border-b border-accent-warm/40 py-2">
            <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="tabular mt-4 text-right text-caption text-muted-foreground">Fojas 1 a 128</p>
    </div>
  );
}

function BrandPanel(): React.JSX.Element {
  return (
    <aside
      data-testid="auth-brand-panel"
      className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex"
    >
      <div className="relative flex w-full flex-col justify-between px-12 py-10 xl:px-16">
        <Wordmark inverted />

        <div className="space-y-10">
          <h2 className="max-w-md font-display text-hero leading-[1.1] font-semibold tracking-tight">
            La operación de tu despacho, en orden.
          </h2>
          <CaseCover />
        </div>

        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-caption opacity-70">
          {CLAIMS.map((claim) => (
            <li key={claim} data-claim>
              {claim}
            </li>
          ))}
        </ul>
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
            <p className="text-small text-muted-foreground">Expedientes de tu despacho, en orden</p>
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
