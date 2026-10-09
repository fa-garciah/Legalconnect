# Contract — Notes and Activity API

**Feature**: `008-notes-and-activity` · Refusals follow `004/contracts/refusal.md`. Every route is
nested under `/tenant/cases/:caseId`; an unreachable, unknown or other firm's matter answers the same
`404 not_found`. `BM`, `PO` and portal archetypes get `403` on every route; `SA` on routes 1–4.

## Shapes

```json
// Note
{ "id": "…", "body": "…", "createdAt": "2026-10-09T17:00:00.000Z",
  "author": { "membershipId": "…", "position": "Asociado" },
  "own": true, "correctableUntil": "2026-10-10T17:00:00.000Z" | null }

// ActivityEntry
{ "id": "…", "action": "document.uploaded", "occurredAt": "…",
  "actor": { "membershipId": "…", "position": "Socio" } | null, "fileName": "Demanda.pdf" | null }
```

## 1. `GET …/notes?month=YYYY-MM` — `note.read`

Active notes of that Mexico City month (default: current), newest first.
`200 { "month": "2026-10", "items": Note[] }`. Audit `note.list_read` (interactive only), target the
matter, metadata `{ "month": "2026-10" }`. `400` on a malformed month.

## 2. `POST …/notes` — `note.create`

Body `{ "body": "1..5000 chars" }` (any `visibility` is ignored). `201 Note`. Audit `note.created`.

## 3. `PATCH …/notes/:noteId` — `note.correct_own`

Body `{ "body": "…" }`. `200 Note`. Audit `note.corrected` `{ "changed": ["body"] }` (or `[]` when
unchanged). `404` not own / not on this matter; `409 note_voided`; `409 correction_window_closed`.

## 4. `POST …/notes/:noteId/void` — `note.correct_own`

`200 { "id": "…" }`. Audit `note.voided`. Refusals as §3.

## 5. `GET …/activity?month=YYYY-MM` — `case.read_activity`

`200 { "month": "2026-10", "items": ActivityEntry[], "truncated": false }` — at most 200, newest
first, allow-listed actions only (spec FR-013), no metadata values. Not audited.
