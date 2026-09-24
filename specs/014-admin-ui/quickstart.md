# Quickstart — Firm Administration (`/configuracion`)

**Feature**: `014-admin-ui` · **Spec**: [spec.md](./spec.md) · **Contract**: [contracts/admin-screens.md](./contracts/admin-screens.md)

How to see this slice working, by hand and automatically.

## Setup

| Piece | Command |
|---|---|
| Database + object store | `docker compose up -d` in `backend/` |
| Migrations (includes `0044`) | `npm run db:migrate && npm run db:seed` in `backend/` |
| Backend | `PORT=3001 npm run dev` in `backend/` |
| Frontend | `npm run dev` in `frontend/` (port 3000) |
| Playwright browser | `npx playwright install chromium` (not installed by `npm ci`) |

**Invitation rate limit.** A firm may issue 50 invitations per hour
(`INVITATION_ISSUANCE_RATE_PER_HOUR`). The backend contract suites issue many invitations in the
seeded tenant A, so after a local `npm test` the same tenant refuses with `429 rate_limited` for up
to an hour. For a local e2e run straight after the backend suite, start the backend with
`INVITATION_ISSUANCE_RATE_PER_HOUR=1000`.

**Do not run `next build` while `next dev` is serving.** Both write `.next/`; the dev server then
fails every page with "Jest worker encountered 2 child process exceptions". Stop it, delete
`.next/`, and start it again.

**The e2e writes into the seeded firm.** The demo identity belongs to seeded tenant A, so
`configuracion.spec.ts` leaves a retired "Cargo e2e-…" position there, and `017`'s
`position-catalog.test.ts` (which expects exactly the five default positions) then fails locally.
Remove it with `DELETE FROM position WHERE name LIKE 'Cargo e2e-%' AND status = 'retired'` as
`lc_migration`, or re-create the database. CI starts from a fresh one and is unaffected.

## Scenario 1 — Invite, copy, accept (US1, Decision 3)

1. Sign in as an SA or MP of the firm and open **Configuración** in the navigation.
2. **Invitar** → email + role → **Enviar invitación** → type the six-digit code (step-up, 005).
3. The link modal shows `http://localhost:3000/aceptar/{token}` and says it is shown once.
   **Copiar enlace**, then **Listo**. The pending table lists the invitation by email.
4. In a private window open the link, enter the same email and a password of 12+ characters.
   You land on `/ingresar?invitacion=aceptada`.
5. Back in the first window, reload: the person is in **Miembros del despacho** with their email.

## Scenario 2 — Revoke an invitation, deactivate a member (US1)

- **Revocar** on a pending row → confirm → code → the row disappears.
- **Desactivar** on a member → confirm → code → the member disappears. The firm's last
  **Administrador** has no **Desactivar**.

## Scenario 3 — Positions and roles (US2)

- **Cargos y roles** → **Nuevo cargo** → a name → **Crear cargo**; a duplicate of an active name is
  refused before sending. **Retirar** → confirm → the position shows **Retirado**.
- **Asignar cargo** offers active positions only, plus **Sin cargo**.
- **Cambiar rol** exists for an **Administrador** only (not for a **Socio**), is disabled for the
  last administrator, and asks for the code.

## Scenario 4 — The matrix is read-only (US3, Decision 1)

**Matriz de permisos** shows each capability by role, with "Permitido" / "No permitido" for screen
readers, and a note that roles are defined by LegalConnect. Nothing on the tab is a control.

## Automated

| Tier | Command |
|---|---|
| Backend contract + isolation | `npm test` in `backend/` (includes `tenant-members`, `members-email-isolation`, `invitation-issue-link`, `list-invitations`) |
| Frontend unit + component | `npm test` in `frontend/` |
| End to end | `E2E_SIGNIN_EMAIL=… E2E_SIGNIN_SECRET=… E2E_SIGNIN_PASSWORD=… E2E_ADMIN_FIRM=Alfa npx playwright test tests/e2e/configuracion.spec.ts --project=desktop` |
