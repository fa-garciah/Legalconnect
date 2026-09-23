# Quickstart Results — Firm Administration (`/configuracion`)

**Feature**: `014-admin-ui` | **Validated**: 2026-09-23
**Quickstart**: [quickstart.md](./quickstart.md) | **Spec**: [spec.md](./spec.md)

What was actually run, what passed, and what was NOT verified. Written by the implementer
(Claude) — the CC technical lead's sign-off (T032) is separate and still open.

---

## Environment

| Piece | Value |
|---|---|
| Backend | `PORT=3001 INVITATION_ISSUANCE_RATE_PER_HOUR=1000 npm run dev`, migrated through `0044` |
| Database | `legalconnect-db` (postgres:16), seeded |
| Frontend | `next dev` on 3000 (Next 16.3.3, Turbopack) |
| Identity | Demo MP of firm Alfa, enrolled in TOTP |
| Browser | Chromium, desktop project |

## Automated gates

| Gate | Result |
|---|---|
| Backend `npm run lint`, `tsc --noEmit`, `npm test -- --coverage` | ✅ 177 files, 1,677 tests; coverage thresholds met |
| `test:isolation` / `test:rls` / `verify:role` | ✅ 77 / 31 / 4 |
| Frontend `npm test` | ✅ 63 files, 540 tests |
| Frontend `typecheck`, `lint`, `build` | ✅ clean; `/configuracion` built as a dynamic route |
| Colour literals in `src/app/configuracion`, `src/configuracion` | ✅ 0 |
| `tests/e2e/configuracion.spec.ts` (desktop) | ✅ 4/4 in 23.8 s |

## Scenarios

| Scenario | Result |
|---|---|
| 1 — invite → copy link → accept in a fresh browser → member listed with email | ✅ e2e |
| 1 — the token is not in the page after the modal closes | ✅ e2e (`page.content()` checked) |
| 2 — revoke a pending invitation (confirm + step-up) | ✅ e2e |
| 2 — deactivate a member (confirm + step-up) | ✅ component test only — **not run by hand or e2e** |
| 3 — create and retire a position | ✅ e2e |
| 3 — assign a position; change a role (SA only, step-up) | ✅ component tests only — **not run e2e** (the demo identity is MP, which correctly gets no "Cambiar rol") |
| 4 — the matrix tab has no control | ✅ e2e + component |
| Mobile viewport | ❌ **not run** — the spec is desktop-only on purpose (it writes); layout at 375 px was not checked |

## Defects found during validation

1. **Every e2e sign-in was broken** since the login redesign (020): the password field's "Mostrar
   contraseña" toggle also matched `getByLabel('Contraseña')`. Fixed with `{ exact: true }` in
   `auth-helpers.ts`, `auth-sign-in.spec.ts` and this slice's spec. The existing auth specs were
   NOT re-run after the fix.
2. **The Spanish-copy check could not see glued words.** It read `textContent`, which joins adjacent
   nodes with no space, so a hidden English "Close" after a title read as "…invitaciónClose" and
   never matched. The shared dialog's close button had said "Close" to screen readers on every
   dialog in the product. Label fixed to "Cerrar"; the check now joins text nodes with spaces, and
   was shown to fail (5 tests) with "Close" restored.
3. **The shared test tenant runs out of invitations.** See the quickstart's rate-limit note.

## Observations for other slices (not fixed here)

- **Step-up codes are not replay-guarded** (`backend/src/modules/auth/step-up.service.ts`). Sign-in
  runs every code through `claim_attempt` (90-second replay window); step-up only checks the code
  against the secret. One observed code can open several elevations within its 30-second window.
  Each elevation is still single-use and bound to one capability, so the exposure is narrow, but it
  is weaker than sign-in. Belongs to `005`.
- **A `429 rate_limited` shows the opaque refusal** ("No se pudo completar esta acción"). `016a`'s
  classifier has no bucket for it; a specific message ("se alcanzó el límite de invitaciones por
  hora") would be kinder. Belongs to `016a`.
