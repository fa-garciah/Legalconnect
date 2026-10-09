# Contract — Dashboard API

**Feature**: `024-dashboard-principal` · Refusals follow `004/contracts/refusal.md`.

## `GET /tenant/dashboard` — `dashboard.read` (row 56)

`200`:

```json
{
  "today": "2026-10-09",
  "activeMatters": 7,
  "myMinutesToday": 135,
  "todayEvents": [EventSummary],
  "deadlines": { "upcoming": [EventSummary], "recent": [EventSummary] },
  "recentActivity": [DashboardActivity]
}

// EventSummary
{ "id": "…", "type": "hearing" | "deadline" | "meeting" | "other", "title": "…",
  "allDay": false, "startsAt": "2026-10-09T16:00:00.000Z" | null, "startsOn": "2026-10-09" | null,
  "case": { "id": "…", "fileNumber": "EXP-2026-0042" } | null }

// DashboardActivity — 008's ActivityEntry plus the matter
{ "id": "…", "action": "document.uploaded", "occurredAt": "…",
  "actor": { "membershipId": "…", "position": "Socio" } | null, "fileName": "Demanda.pdf" | null,
  "case": { "id": "…", "fileNumber": "EXP-2026-0042" } }
```

- `myMinutesToday` is `null` for a caller without `time.read_own` (`SA`).
- `todayEvents`, `deadlines.upcoming`, `deadlines.recent`: ≤ 10 each; `recentActivity`: ≤ 20.
- Every section is narrowed to the caller's reachable matters (spec FR-004).
- `403 not_authorized` for `BM` and portal archetypes. Not audited.
