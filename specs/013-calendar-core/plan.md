# Implementation Plan: The Firm's Calendar

**Branch**: `013-calendar-core` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md) |
**Contract**: [contracts/calendar-api.md](./contracts/calendar-api.md)

## Summary

A new tenant table, a new module and two capabilities on the backend; a `/calendario` page with a
month grid, a day list, an event dialog and "Recordatorios" on the frontend. No new dependency.

## Data model — migration `0046_calendar_event.sql`

```sql
CREATE TYPE calendar_event_type   AS ENUM ('hearing', 'deadline', 'meeting', 'other');
CREATE TYPE calendar_event_status AS ENUM ('scheduled', 'cancelled');
CREATE TABLE calendar_event (
  id, tenant_id → tenant, case_id → case_file NULL, type, title, description, location,
  all_day bool, starts_at timestamptz, ends_at timestamptz, starts_on date, ends_on date,
  remind_minutes_before int NULL CHECK IN (15, 60, 1440, 2880, 10080),
  status, cancelled_at, created_by_membership_id → membership, created_at, updated_at,
  CHECK shape: all_day → starts_on NOT NULL AND starts_at IS NULL AND ends_at IS NULL
               NOT all_day → starts_at NOT NULL AND starts_on IS NULL AND ends_on IS NULL,
  CHECK ends_at ≥ starts_at, ends_on ≥ starts_on, cancelled ⇔ cancelled_at,
  CHECK lengths (title 1..200, location ≤ 200, description ≤ 2000)
);
```

- RLS enabled and forced; one `lc_app` policy `calendar_event_own_tenant` (null-safe, as every
  tenant table). `GRANT SELECT, INSERT, UPDATE` to `lc_app`; no `DELETE` for anyone.
- Indexes: `(tenant_id, starts_at)`, `(tenant_id, starts_on)`, `(case_id)`.
- A trigger-free `case_id` tenant check: the insert/update path reads the case under RLS first, so
  a foreign `case_id` is `404` before the FK is reached; the FK plus RLS on `case_file` backstop it.
- Registered in `TENANT_SCOPED_TABLES`.
- Audit vocabulary: three actions in `AUDIT_ACTIONS`, `TARGET_ENTITY_BY_ACTION` (`calendar_event`),
  and the `audit_event_action_known` CHECK rebuilt in the same migration.

## Range query

Overlap of `[from, to)` in Mexico City days:
- timed: `starts_at < to_ts AND coalesce(ends_at, starts_at) >= from_ts`, where `from_ts`/`to_ts`
  are `(from::date)::timestamp AT TIME ZONE 'America/Mexico_City'`;
- all-day: `starts_on < to AND coalesce(ends_on, starts_on) >= from`.
Assignment narrowing (FR-006) as `case.repository.ts` `list()`:
`(e.case_id IS NULL OR EXISTS (live case_assignment for the caller's membership))`, one
parenthesised condition, skipped for MP/SA.

## Structure

```text
backend/src/modules/calendar/
  calendar.module.ts · calendar.controller.ts · calendar.service.ts · calendar.repository.ts
  calendar-input.ts            # validation of the write body (pure, unit-tested)
frontend/src/calendar/
  types.ts · api.ts · month-grid.ts (pure: weeks of a month, events per day) · format.ts · schema.ts
frontend/src/app/calendario/
  page.tsx · CalendarView.tsx · MonthGrid.tsx · DayList.tsx · EventDialog.tsx · RemindersPanel.tsx
```

## Constitution Check

| Principle | How |
|---|---|
| I | spec → plan → tasks; stories US01–US04-EP05 |
| II | New table under RLS, registered; isolation test with two firms and a non-assigned member |
| III | Types are product vocabulary, not a firm's; no firm-specific default |
| IV | Rows 44–45 in `matrix.ts`, `capability.ts`, the frontend mirror and both sync tests |
| V | Three audit actions, CHECK constraint, no delete |
| VI | Events carry matter content → BM excluded; update audit records field names, never values |
| TDD | Every task below |
