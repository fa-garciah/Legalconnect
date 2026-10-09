# Data Model — Case Notes and Case Activity

**Feature**: `008-notes-and-activity` · Migration `0049_case_note.sql`

## `case_note`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | |
| `tenant_id` | uuid → `tenant` | no | RLS key |
| `case_id` | uuid → `case_file` | no | immutable |
| `author_membership_id` | uuid → `membership` | no | the creating caller |
| `body` | text | no | trimmed, 1..5000 chars |
| `visibility` | `case_note_visibility` (`internal`) | no | default `internal`; `CHECK (visibility = 'internal')` — Decision 1 |
| `status` | `case_note_status` (`active`, `voided`) | no | default `active` |
| `created_at`, `updated_at` | timestamptz | no | the correction window runs from `created_at` |
| `voided_at` | timestamptz | yes | iff `voided` |

Constraints: `case_note_body_bounds`, `case_note_internal_only`, `case_note_voided_consistent`
(`(status = 'voided') = (voided_at IS NOT NULL)`). Indexes: `(tenant_id, case_id, created_at)`.
RLS enabled and forced, null-safe `lc_app` policy; `GRANT SELECT, INSERT, UPDATE`; no `DELETE`.

## State

`active` → (correct, own, < 24 h) → `active` · `active` → (void, own, < 24 h) → `voided` (terminal).

## Activity entry (derived, not stored)

`{ id, action, occurredAt, actor: { membershipId, position } | null, fileName | null }` — read from
`audit_event` per [plan.md](./plan.md#activity-query-shape). No `metadata` value leaves the query.

## Audit vocabulary

`0049` re-issues `audit_event_action_known` with `0048`'s list plus `note.created`, `note.corrected`,
`note.voided`, `note.list_read` (target `case_note` for the first three, `case_file` for the last;
`note.list_read` channel-gated).
