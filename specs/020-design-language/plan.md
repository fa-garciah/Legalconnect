# Implementation Plan: The Product's Visual Language

**Branch**: `020-design-language` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-design-language/spec.md`

**Status**: Implemented in commit `1f50d25` with open verification and deferred items. All theme tokens (`globals.css`), Google Fonts typography integration (`layout.tsx`), and authentication screen framing (`AuthCard.tsx`, `fields.tsx`) are implemented; automated test contracts pass in `theme-tokens.test.tsx` and `AuthCard.test.tsx`. Four items remain genuinely open: D2 pill-shaped controls (vendored components `button.tsx` and `input.tsx` deferred), SC-004 recorded contrast table, SC-005 recorded single-value `--brand` repaint demonstration, and CC technical-lead sign-off on `spec.md`'s Approval Checklist. See Open Items.

## Summary

Give LegalConnect MX one cohesive, decided visual language — typeface, type scale, palette, density, and shape — defined once in `globals.css`, applied across the entire product, and editable in a single place (`US21-EP00-FND-ApplyProductVisualIdentity`).

The product previously operated on scaffold defaults inherited from `create-next-app` (`Geist` / `Geist_Mono`), an ad-hoc palette extracted from early prototypes, and an unreachable `.dark` stylesheet block that was never mounted or activated. This slice replaces that scaffold with an intentional design identity:

- **Typography**: Replaces `Geist` with two dedicated typefaces loaded via `next/font/google`: **Newsreader** (a serif carrying the product's voice for page titles, section headings, and legal file/matter numbers) and **Public Sans** (a clean, legible sans carrying all interface text) (FR-002, SC-002). Record identifiers, dates, and RFCs are set to tabular figures (`font-variant-numeric: tabular-nums`) so columns align naturally (FR-003).
- **Theme Tokens via Tailwind CSS v4 `@theme inline`**: Preserves the established brand indigo (`#3730A3` brand, `#2D2582` hover, `#EEF2FF` tint) (FR-004) and pairs it with warm neutral surfaces (`--background: #faf8f3`, `--rail: #f3f0e9`, `--border: #e4ddd1`) to evoke ink on legal paper rather than generic SaaS white (D3, FR-006). Introduces an ochre secondary accent (`--accent-warm: #b8843f`) to distinguish natural persons from corporate entities and denote suspended matters (FR-005). Retunes form field borders (`--input: #968a77`) to satisfy WCAG 1.4.11 (3:1 contrast against card and background surfaces) (FR-012).
- **Type Scale and Density**: Codifies a strict five-step type scale (`--text-hero`, `--text-display`, `--text-heading`, `--text-body`, `--text-small`, `--text-caption`) (FR-001) and four density tokens (`--space-control-h: 2.625rem`, `--space-row-h: 3rem`, `--space-card-p: 1.25rem`, `--space-page-gutter: 2rem`) to ensure all screens maintain comfortable 8-hour daily operational rhythms (FR-008).
- **Dark Theme Removal**: Deletes the dead `.dark` block and `@custom-variant dark` declaration from `globals.css` rather than maintaining an unreachable, untestable secondary palette (D1, FR-011).
- **Authentication Presentation**: Wraps the four unchromed authentication routes (`/ingresar`, `/verificar`, `/enrolar`, `/recuperar`, plus `/aceptar`) in a unified `AuthCard` frame featuring a brand panel with an accessible, decorative fiscal voucher and strictly verified claims that promise only existing platform capabilities (FR-010).
- **D2 Deferral**: Pill-shaped buttons and inputs require editing vendored components (`components/ui/button.tsx` and `components/ui/input.tsx`) ported stock in `018`. Because `--radius` drives dialogs, cards, and popovers as well, editing the stock component classes is scoped separately and deferred to avoid risking visual regressions across the 49 ported components.

## Technical Context

Values marked **fixed by constitution** cannot change without a formal amendment.

**Language/Version**: TypeScript 5.x / Node.js LTS (Next.js 16 App Router) — **fixed**.

**Primary Dependencies**: Next.js 16, React 19, Tailwind CSS v4 (`@theme inline`), `next/font/google` (`Newsreader`, `Public_Sans`), `tw-animate-css`, `lucide-react`. Zero new runtime npm dependencies added. `tw-animate-css` replaces retired Tailwind animation plugins for accordion and transition keyframes.

**Storage**: N/A (Frontend styling, typography, and token configuration only). No database schema, migrations, or backend tables touched.

**Testing**: Vitest, React Testing Library (`@testing-library/react`), `@testing-library/jest-dom`, jsdom. Token contract tests in `theme-tokens.test.tsx` parse `globals.css` and `layout.tsx` directly to verify token completeness, font removal, and contrast math without jsdom CSS pipeline limitations. Component tests in `AuthCard.test.tsx` assert element roles, semantic structure, accessibility attributes (`aria-hidden`), and contrast rules.

**Target Platform**: Responsive web (modern evergreen desktop and mobile browsers).

**Project Type**: Web application (frontend only, Server and Client Components in Next.js App Router).

**Performance Goals**: Zero Cumulative Layout Shift (CLS) and minimal font swap flicker via `next/font/google` with `display: 'swap'` injecting CSS variables (`--font-newsreader`, `--font-public-sans`) into `<html>`. Zero runtime CSS-in-JS overhead; Tailwind v4 compiles static utility classes directly from `@theme inline`.

**Constraints**:
- Strict compliance with WCAG 2.1 AA contrast requirements: >= 4.5:1 for normal body text, >= 3:1 for large text (>= 24px) and non-text UI control boundaries per WCAG 1.4.11 (`--input` border >= 3:1 against card and background surfaces) (FR-012).
- Zero color literals in application code `frontend/src/**` (SC-001, FR-009).
- No scaffold typeface (`Geist`) in `layout.tsx` (SC-002, FR-002).
- Complete removal of unreachable `.dark` theme declarations (D1, FR-011).
- All changes to product-wide identity must remain centralized in `globals.css` without component-level ad-hoc overrides (FR-013).

**Scale/Scope**: 1 global stylesheet (`globals.css`), 1 root layout (`layout.tsx`), 2 auth UI components (`AuthCard.tsx`, `fields.tsx`), 2 test suites (`theme-tokens.test.tsx`, `AuthCard.test.tsx`). Touches 0 backend files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.5.0**, introduced in commit `faae3a7`.

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | Feature spec `specs/020-design-language/spec.md` written, zero `[NEEDS CLARIFICATION]`; its Approval Checklist is NOT yet signed by the CC technical lead (see tasks T028). Traceability: `US21-EP00-FND-ApplyProductVisualIdentity` in `master-user-story-catalog.md` under `EP00-Foundations`. Pre-specification decisions settled from rendered prototypes. |
| II | Tenant Isolation is Absolute (NON-NEGOTIABLE) | ✅ PASS | Design tokens and layout wrappers operate purely in the frontend presentation layer. No data access layer, SQL queries, RLS policies, or tenant context interceptors are touched. No vector for cross-tenant data leakage exists. |
| III | Product Core vs. Tenant Customization | ✅ PASS | Visual identity belongs to LegalConnect MX as a commercial product core, not hardcoded to Felipe's firm or Cosmic Chimps branding (Settled Decision 3 in spec.md). No client identifiers or tenant-specific conditional styling exist. |
| IV | Least Privilege by Default | ✅ PASS | No permissions, archetypes, or authorization checks are bypassed or altered. UI presentation respects existing role-based access controls and unchromed auth routes. |
| V | Auditable by Construction | ✅ PASS | Visual tokens and layout styles produce no domain mutations; audit event emission and append-only audit logging are unaffected. |
| VI | Compliance-by-Design (LFPDPPP + CFDI/SAT) | ✅ PASS | No personal data stored. Decorative fiscal voucher in `AuthCard.tsx` uses dummy/fictitious RFCs (`DAL091203AB1`, `XAXX010101000`) and is marked `aria-hidden="true"`, ensuring assistive technology is not misled and no real taxpayer data is exposed. Copy claims strictly verified not to promise unbuilt CFDI 4.0 stamping or invoicing. |

**Additional gates:**
- Strict TDD: Exemptions 1 & 4 cover visual styles, copy, and layout. However, token contracts and accessibility checks are codified in automated tests (`theme-tokens.test.tsx`, `AuthCard.test.tsx`).
- Merge Rules: English for spec, plan, tasks.
- MVP Prohibitions: No microservices, GraphQL, or external services introduced.

**Gate result: PASSED.**

### Re-check — after Phase 1 design

No principle moved. Two specific frontend design aspects surfaced during implementation:
1. **WCAG 1.4.11 Control Boundary Contrast**: During design critique, `--input` at `#e4ddd1` was found to have a 1.35:1 contrast ratio against cards, rendering form fields almost invisible. Retuning `--input` to `#968a77` achieves 3.39:1 on cards and 3.19:1 on background, satisfying WCAG 2.1 AA.
2. **Auth Card Claim Discipline**: The reference design featured promises of "Facturación CFDI 4.0 / Contabilidad / Inventarios". Because slice 011 (CFDI stamping) is unbuilt and the PAC is `[PENDING]`, claims were pared back to capabilities already shipping (`RFC con formato SAT`, `Bitácora inmutable`, `Verificación en dos pasos`), enforced by `AuthCard.test.tsx`.

## Project Structure

### Documentation (this feature)

```text
specs/020-design-language/
├── spec.md                       # Approved spec: FR-001..FR-013, SC-001..SC-005, D1..D3
├── plan.md                       # This file (implementation plan)
└── tasks.md                      # Task list (TDD order, [X] vs [ ])
```

### Source Code (repository root)

```text
frontend/
├── src/
│   └── app/
│       ├── (auth)/
│       │   ├── AuthCard.tsx      # Auth screen frame (brand panel, fiscal voucher, claims)
│       │   ├── fields.tsx        # Auth form fields (IconField, PasswordField, control height)
│       │   └── ingresar/
│       │       ├── page.tsx      # Sign-in page mounted inside AuthCard
│       │       └── SignInForm.tsx # Sign-in form using fields.tsx and button styling
│       ├── globals.css           # Tailwind v4 @theme inline tokens (palette, type scale, density)
│       └── layout.tsx            # RootLayout loading Newsreader & Public_Sans Google Fonts
└── tests/
    └── component/
        ├── auth/
        │   └── AuthCard.test.tsx # Component tests for AuthCard structure, accessibility, claims
        └── theme-tokens.test.tsx # Theme token contract, font checks, WCAG 1.4.11 input border contrast
```

**Structure Decision**: Frontend modular structure matching `016a-frontend-shell` and `018-frontend-clients`. Centralized styling in `src/app/globals.css`, root font injection in `src/app/layout.tsx`, reusable authentication frame in `src/app/(auth)/AuthCard.tsx` and `src/app/(auth)/fields.tsx`. Touches no backend files.

## Complexity Tracking

| Change / Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Deferred pill-shaped controls (D2)**: vendored `components/ui/button.tsx` and `components/ui/input.tsx` remain stock `rounded-md` | The chosen direction draws buttons and inputs as pill shapes. In Tailwind v4, `--radius` derives `--radius-sm`, `--radius-md`, `--radius-lg`, and `--radius-xl` which are shared across all 49 ported components (including dialogs, alerts, cards, and popovers). Retuning `--radius: 9999px` would turn modal dialogs and cards into pills. | Directly modifying `button.tsx` and `input.tsx` to add `rounded-full` was deferred so that the foundational token system, typography, color palette, and auth screens could land and be verified independently without introducing regression risk across the 49 ported components. |

## Open Items for the CC technical lead

**Resolved in Code:**
1. **D1 Dark Theme Removal**: Removed unused `.dark` block and `@custom-variant dark` in `globals.css`; verified by `theme-tokens.test.tsx`.
2. **D3 Warm Ground with Cool Brand**: Resolved to `#3730A3` on `#FAF8F3`; verified by `theme-tokens.test.tsx`.
3. **WCAG 1.4.11 Input Border Contrast**: Solved by retuning `--input` to `#968a77`; verified by `theme-tokens.test.tsx`.

**Genuinely Open:**
1. **D2 Pill-shaped Buttons and Inputs**: Vendored components (`components/ui/button.tsx`, `components/ui/input.tsx`) remain stock `rounded-md`. Requires follow-up task to update class definitions to `rounded-full`.
2. **SC-004 Contrast Measurement Table**: Formal markdown contrast table recording every text-on-surface and icon-on-surface token pair across the design system has not been compiled into a spec document.
3. **SC-005 Single-Value `--brand` Repaint Demonstration**: Screen repaint demonstration following a single-value change to `--brand` in `globals.css` needs to be recorded.
4. **Approval Checklist Sign-off in `spec.md`**: Items 4–7 in `spec.md` (lines 220–227) remain unchecked awaiting CC technical lead sign-off.
