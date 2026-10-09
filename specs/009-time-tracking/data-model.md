# Data Model — Recording Time

**Feature**: `009-time-tracking` · Migration `0048_time_entry.sql`

## `time_entry`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `gen_random_uuid()` |
| `tenant_id` | uuid → `tenant` | no | RLS key |
| `case_id` | uuid → `case_file` | no | FR-001; immutable (FR-013) |
| `membership_id` | uuid → `membership` | no | the timekeeper, always the creating caller |
| `source` | `time_entry_source` (`timer`, `manual`) | no | |
| `status` | `time_entry_status` (`running`, `logged`, `voided`) | no | |
| `work_date` | date | no | Mexico City day; for a timer, the day it started (FR-003) — set at start and **recomputed from `started_at` on stop**, so the stored day is always derived from the instant, never from when the request arrived |
| `minutes` | integer | yes | `NULL` iff never logged; `1..1440` |
| `description` | text | yes | required once logged; `1..1000` chars, trimmed |
| `started_at` | timestamptz | yes | timer only |
| `stopped_at` | timestamptz | yes | timer only, set on stop |
| `logged_at` | timestamptz | yes | when it became time: creation (manual) or stop (timer); the correction window runs from it |
| `voided_at` | timestamptz | yes | set by void or discard |
| `created_at`, `updated_at` | timestamptz | no | |

### Constraints

- `time_entry_minutes_bounds`: `minutes IS NULL OR minutes BETWEEN 1 AND 1440`
- `time_entry_description_bounds`: `description IS NULL OR char_length(description) BETWEEN 1 AND 1000`
- `time_entry_source_shape`: `manual` ⇒ `started_at IS NULL AND stopped_at IS NULL`; `timer` ⇒
  `started_at IS NOT NULL`
- `time_entry_status_shape`:
  - `running` ⇒ `source = 'timer' AND stopped_at IS NULL AND minutes IS NULL AND logged_at IS NULL AND voided_at IS NULL`
  - `logged` ⇒ `minutes IS NOT NULL AND description IS NOT NULL AND logged_at IS NOT NULL AND voided_at IS NULL`
  - `voided` ⇒ `voided_at IS NOT NULL`
- `time_entry_stop_after_start`: `stopped_at IS NULL OR stopped_at >= started_at`
- Partial unique index `time_entry_one_running_timer` on `(membership_id) WHERE status = 'running'` (FR-006)

### Indexes

`(tenant_id, membership_id, work_date)` for the timesheet; `(case_id)` for the FK and future
per-matter reads; the partial unique index above.

### Security

RLS enabled **and forced**; one policy `time_entry_own_tenant` for `lc_app`, null-safe
(`NULLIF(current_setting('app.tenant_id', true), '')::uuid`). `GRANT SELECT, INSERT, UPDATE` to
`lc_app`; **no `DELETE`** for anyone (FR-012). Registered in `TENANT_SCOPED_TABLES`.

## State transitions

```text
            start (48)                    stop (48)
   ∅ ───────────────────▶ running ───────────────────▶ logged ──┐
                            │                            ▲  │     │ correct (50, < 24 h)
                            │ discard (51)               │  └─────┘
                            ▼                    manual (48)
                          voided ◀───────── void (50, < 24 h) ── logged
```

`voided` is terminal. No transition leaves `logged` except `void`, and only within 24 h of
`logged_at`.

## Audit vocabulary

`0048` drops and re-creates `audit_event_action_known` with `0047`'s list plus:
`time_entry.timer_started`, `time_entry.timer_stopped`, `time_entry.timer_discarded`,
`time_entry.logged`, `time_entry.corrected`, `time_entry.voided` — all with target entity
`time_entry`, none channel-gated.
