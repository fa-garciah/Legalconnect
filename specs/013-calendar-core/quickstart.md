# Quickstart — The Firm's Calendar

**Feature**: `013-calendar-core` · **Spec**: [spec.md](./spec.md)

## Setup

As `021`'s quickstart, with migration `0046` applied (`npm run db:migrate`) and `npm run db:seed`
re-run (it adds one "Junta semanal del despacho" per seeded firm).

## Scenario 1 — See the month (US1)

**Calendario** in the navigation (not shown to Administración/BM). Today is marked; the grid asks
the API for exactly the weeks it shows. Choose a day: its events are listed in time order, all-day
first, with type, time, place and — when linked — the case's file number, which opens its
documents.

## Scenario 2 — Add, change, cancel (US2, US3)

- **Nuevo evento**: type, title, all-day or start/end time (Mexico City time), optional case (only
  the cases you are on are offered), place, description, reminder.
- **Editar** changes only what you touch; the audit entry names the fields changed, not their
  values.
- **Cancelar** asks first and keeps the event; **Mostrar cancelados** shows it struck through.

## Scenario 3 — Reminders (US4)

An event whose reminder time has passed and that has not started appears under **Recordatorios**,
refreshed every minute. Nothing is emailed: no channel exists yet (Decision 2).

## Automated

| Tier | Command |
|---|---|
| Backend | `npm test` (`calendar-input`, `calendar-events`, `calendar-isolation`, `calendar-audit-actions`) |
| Frontend | `npm test` (`tests/unit/calendar/`, `tests/component/calendario/`) |
| e2e | `E2E_SIGNIN_EMAIL=… E2E_SIGNIN_SECRET=… E2E_SIGNIN_PASSWORD=… E2E_ADMIN_FIRM=Alfa npx playwright test tests/e2e/calendario.spec.ts --project=desktop` |
