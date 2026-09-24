# Contract — Calendar API

**Feature**: `013-calendar-core` · Refusals follow `004/contracts/refusal.md`.

## Shapes

```json
// CalendarEvent
{
  "id": "…",
  "type": "hearing" | "deadline" | "meeting" | "other",
  "title": "Audiencia de pruebas",
  "description": null,
  "location": "Juzgado 4° Civil",
  "allDay": false,
  "startsAt": "2026-09-30T16:00:00.000Z",   // timed events only, else null
  "endsAt": "2026-09-30T17:00:00.000Z",     // optional
  "startsOn": null,                          // all-day events only, "YYYY-MM-DD"
  "endsOn": null,                            // optional, inclusive
  "case": { "id": "…", "fileNumber": "EXP-2026-0042" } | null,
  "remindMinutesBefore": 1440 | null,
  "status": "scheduled" | "cancelled",
  "cancelledAt": null,
  "createdByMembershipId": "…",
  "createdAt": "…"
}
```

```json
// Write body (create; every field optional on update)
{
  "type": "hearing",
  "title": "Audiencia de pruebas",
  "description": null,
  "location": "Juzgado 4° Civil",
  "allDay": false,
  "startsAt": "…", "endsAt": "…",       // when allDay = false
  "startsOn": "2026-09-30", "endsOn": null, // when allDay = true
  "caseId": "…" | null,
  "remindMinutesBefore": 1440 | null     // 15, 60, 1440, 2880 or 10080
}
```

## 1. `GET /tenant/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD[&includeCancelled=true]`

`calendar.read` (row 44, `tenant`). Unaudited. Events overlapping `[from, to)` in
America/Mexico_City days, ordered by start. `to − from` ≤ 62 days, else `400 validation_failed`.
For non-MP/SA callers, case-linked events are filtered by live assignment inside the query (FR-006).
`200 { "items": CalendarEvent[] }`.

## 2. `GET /tenant/calendar/reminders`

`calendar.read`. Unaudited. Non-cancelled, caller-visible events with a reminder whose reminder time
has passed and whose start has not, soonest first, at most 50. `200 { "items": CalendarEvent[] }`.

## 3. `POST /tenant/calendar/events`

`calendar.manage` (row 45). Audit `calendar_event.created`. `201 CalendarEvent`.
Refusals: `400 validation_failed` (shape, lengths, end before start, unknown type or reminder);
`404 not_found` when `caseId` names a case the caller cannot reach or that does not exist.

## 4. `PATCH /tenant/calendar/events/:id`

`calendar.manage`. Audit `calendar_event.updated` with `{ changed: ["title", "startsAt"] }` —
field names only. `200 CalendarEvent`. `404` for an event the caller cannot see (another firm, or a
case they are not on) or that does not exist; `409 event_cancelled` when it is cancelled; `400` as
above. Changing `caseId` checks the new case as §3 does.

## 5. `PATCH /tenant/calendar/events/:id/cancel`

`calendar.manage`. Audit `calendar_event.cancelled`. `200 CalendarEvent`. `404` as §4;
`409 event_cancelled` when already cancelled. There is no delete route.
