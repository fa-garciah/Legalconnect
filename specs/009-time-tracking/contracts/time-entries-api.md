# Contract — Time Entries API

**Feature**: `009-time-tracking` · Refusals follow `004/contracts/refusal.md`. Every route refuses
`BM`, `SA`, `PO` and portal archetypes (`403`); a caller of another firm gets `404`.

## Shapes

```json
// TimeEntry (a logged entry, as listed)
{
  "id": "…",
  "case": { "id": "…", "fileNumber": "EXP-2026-0042" },
  "workDate": "2026-10-08",
  "minutes": 90,
  "description": "Redacción de contestación de demanda",
  "source": "timer" | "manual",
  "loggedAt": "2026-10-08T21:14:03.000Z",
  "correctableUntil": "2026-10-09T21:14:03.000Z" | null
}
```

```json
// RunningTimer
{
  "id": "…",
  "case": { "id": "…", "fileNumber": "EXP-2026-0042" } | null,
  "caseAvailable": true | false,
  "startedAt": "2026-10-08T15:02:00.000Z",
  "description": "…" | null
}
```

## 1. `GET /tenant/time-entries?from=YYYY-MM-DD&to=YYYY-MM-DD`

Row 49. Unaudited. The caller's own `logged` entries with `workDate` in `[from, to)`, newest day
first, then newest `loggedAt`. `to − from` must be 1–62 days, else `400 validation_failed`.
For any archetype but `MP`, entries on matters without a live assignment for the caller are
excluded — from `items` and from both totals.

`200 { "items": TimeEntry[], "totalMinutes": 450, "days": [{ "date": "2026-10-08", "minutes": 210 }] }`
— `days` lists only days with entries, newest first; every figure is the sum of `items`.

## 2. `GET /tenant/time-entries/timer`

Row 49. Unaudited. `200 { "timer": RunningTimer | null }`. When the timer's matter is no longer
reachable, `case` is `null` and `caseAvailable` is `false`.

## 3. `POST /tenant/time-entries/timer/discard`

Row 51 (`tenant`). Audit `time_entry.timer_discarded`. The caller's running timer becomes `voided`.
`200 { "id": "…" }`; `409 no_running_timer` when there is none.

## 4. `POST /tenant/cases/:caseId/time-entries`

Row 48 (`assigned`). Audit `time_entry.logged`. Body:
`{ "workDate": "YYYY-MM-DD", "minutes": 1..1440, "description": "1..1000 chars" }`.
`201 TimeEntry`. `400 validation_failed` (shape, bounds, `workDate` after today in Mexico City);
`404` for an unreachable or unknown matter.

## 5. `POST /tenant/cases/:caseId/time-entries/timer`

Row 48. Audit `time_entry.timer_started`. Body `{ "description"?: "≤ 1000 chars" | null }`.
`201 RunningTimer`. `409 timer_running` when the caller already has one (on any matter); `404` as §4.

## 6. `POST /tenant/cases/:caseId/time-entries/timer/stop`

Row 48. Audit `time_entry.timer_stopped`. Body `{ "description"?: "…" }` — required unless the timer
already has one; a value here replaces it. Minutes = elapsed rounded to the nearest minute, at
least 1. `201 TimeEntry`. `409 no_running_timer` when the caller has no running timer on this
matter; `409 timer_too_long` when more than 1440 minutes have elapsed; `400` with no description;
`404` as §4.

## 7. `PATCH /tenant/cases/:caseId/time-entries/:entryId`

Row 50 (`assigned`). Audit `time_entry.corrected` with `{ "changed": ["minutes", "workDate"] }` —
field names only, sorted. Body: any of `workDate`, `minutes`, `description` (others ignored; same
bounds as §4). `200 TimeEntry`. `404` when the entry is not the caller's, not on this matter, or the
matter is unreachable; `409 entry_voided`; `409 correction_window_closed` when `now ≥ loggedAt + 24 h`.
A patch that changes nothing returns `200` and writes `{ "changed": [] }`.

## 8. `POST /tenant/cases/:caseId/time-entries/:entryId/void`

Row 50. Audit `time_entry.voided`. `200 { "id": "…" }`. Refusals as §7.
