# Feature Specification: The Firm's Calendar

**Feature Branch**: `013-calendar-core`
**Created**: 2026-09-23
**Status**: Approved under delegation — see [Decisions](#decisions-taken-under-delegation)
**Input**: `registro-specs-mvp.md` line for `013-calendar-core` (EP05 US01 and US04, without court
sync or Google export), `plan-paralelo-2026-09.md` §B2, `006`'s cases and team, `016a`'s shell.

> **Citation convention.** `004/FR-0NN`, `006/FR-0NN` etc. cite other slices; bare `FR-0NN` is
> this document.
>
> **Authorship.** Written by Claude directly (Antigravity was unavailable). On 2026-09-23 the CC
> technical lead, Francisco Garcia, delegated every open decision in this slice ("toma la mejor
> decisión por mí"). Each decision below says what was chosen and why, and is marked for his
> review rather than as his signature.

---

## Why this slice matters

A law firm runs on dates: hearings (*audiencias*), filing deadlines (*vencimientos de plazo*),
client meetings. A missed procedural deadline is the classic malpractice claim, so the calendar is
the part of the product a partner checks first every morning. Today the navigation shows
"Calendario — Pronto" and nothing else.

## What the catalog asks for, and the one thing it leaves out

The MVP register names **US01-EP05-CAL-ViewUpcomingEvents** (a unified calendar of hearings,
deadlines and meetings) and **US04-EP05-CAL-ReceiveEventNotifications** (automated reminders).
Two facts shape the rest:

1. **Every source of events is out of scope.** Court-portal sync is `US06` (IT3) and scope conflict
   3; creating an event is `US02` (IT2). A calendar nobody can put an event into shows nothing, so
   US01 alone would ship an empty screen → **Decision 1**.
2. **No message can leave the system.** There is no email or WhatsApp provider (the AWS account is
   blocked; WhatsApp is scope conflict 2). "Automated reminders" cannot mean a sent message yet →
   **Decision 2**.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See what is coming (Priority: P1) 🎯 MVP

**Catalog**: `US01-EP05-CAL-ViewUpcomingEvents`.

An associate opens **Calendario** and sees the month's hearings, deadlines and meetings, and the
list of the day they pick.

**Acceptance Scenarios**:

1. **Given** events in the firm, **When** an internal member opens `/calendario`, **Then** a month
   grid shows each day's events (type, time, title) and today is marked; the list beside it shows
   the selected day's events in time order.
2. **Given** the month changes (previous / next / today), **Then** only that month's events are
   requested (the API is asked for a date range, never "everything").
3. **Given** an event linked to a case, **Then** it names the case's file number and links to its
   documents page.
4. **Given** an event linked to a case the caller is NOT on (and the caller is not MP/SA), **Then**
   the event is absent — not shown as "private" (006's ethical wall, FR-006).
5. **Given** a cancelled event, **Then** it is shown struck through as "Cancelado", or hidden by the
   default filter (FR-008).
6. **Given** a `BM`, **Then** there is no Calendario item and the API refuses (FR-004).

### User Story 2 — Put an event on the calendar (Priority: P1) 🎯 MVP (Decision 1)

**Catalog**: `US02-EP05-CAL-ScheduleNewEvent`, pulled into MVP by Decision 1.

1. **Given** an internal member who holds `calendar.manage`, **When** they create an event with
   type, title, date (all-day or start/end time), optional case, optional location, optional
   reminder, **Then** it appears on the calendar.
2. **Given** a case is chosen, **Then** only cases the caller can reach are offered (they come from
   `006`'s case list, already narrowed by assignment).
3. **Given** an end before the start, or a title longer than 200 characters, **Then** it is refused
   before sending, and by the server (`400`).

### User Story 3 — Change or cancel an event (Priority: P2) (Decision 1)

**Catalog**: `US03-EP05-CAL-EditAndRescheduleEvent`, pulled into MVP by Decision 1.

1. **When** a member holding `calendar.manage` edits an event, **Then** the change is saved and
   audited with what changed.
2. **When** they cancel it (confirmed), **Then** it is kept, marked cancelled, and audited — never
   deleted (Principle V).
3. **Given** an event linked to a case the caller cannot reach, **Then** editing it answers `404`,
   identical to an event that does not exist.

### User Story 4 — Be reminded (Priority: P2)

**Catalog**: `US04-EP05-CAL-ReceiveEventNotifications`, delivered in-app only (Decision 2).

1. **Given** an event with a reminder ("1 día antes", "1 hora antes", …), **When** the reminder time
   has passed and the event has not started, **Then** the event appears in "Recordatorios" at the top
   of `/calendario`, and the navigation item shows a count.
2. **Given** the event starts, or is cancelled, **Then** it leaves "Recordatorios".

### Edge Cases

- **All-day events and time zones**: an all-day deadline on 30 Sept is 30 Sept in Mexico City
  whatever the browser's zone; all-day events are stored as dates, not instants (FR-010).
- **An event linked to a case that is later closed**: it stays, still linked; closing a matter does
  not cancel its history.
- **A member removed from the case team**: they stop seeing its events on the next request (the
  predicate reads live assignments, as `006`'s case list does).
- **Month boundaries**: an event from 30 Sept 22:00 to 1 Oct 02:00 appears in both months.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A `calendar_event` belongs to one firm (`tenant_id`, RLS as every tenant table) and
  optionally to one of its cases.
- **FR-002**: Types are a fixed product vocabulary — `hearing` (Audiencia), `deadline`
  (Vencimiento), `meeting` (Reunión), `other` (Otro) — not a firm catalog (Decision 3).
- **FR-003**: An event is either **all-day** (`starts_on`, optional `ends_on`, dates) or **timed**
  (`starts_at`, optional `ends_at`, instants). Exactly one shape, enforced by a CHECK.
- **FR-004**: New capabilities (Decision 4): `calendar.read` — MP, AA, PL, CM, SA; `calendar.manage`
  — MP, AA, PL, CM, SA. `BM` holds neither: case-linked events carry matter content.
- **FR-005**: `GET /tenant/calendar/events?from&to` returns events overlapping `[from, to)`; the
  range is required and at most 62 days, so no request can ask for the whole history.
- **FR-006**: For an archetype other than MP/SA, events linked to a case are returned only when the
  caller has a live assignment on it — the same predicate `006`'s case list uses, inside the
  query's `WHERE`. Events without a case are visible to every holder of `calendar.read`.
- **FR-007**: Create, edit and cancel require `calendar.manage`; for a case-linked event, the caller
  must also reach the case, or the answer is `404` (006's opacity). Linking a new case is checked
  the same way.
- **FR-008**: Cancelling sets `status = cancelled` and `cancelled_at`; there is no delete route and
  no `DELETE` grant. The list includes cancelled events only with `includeCancelled=true`.
- **FR-009**: Three audit actions: `calendar_event.created`, `calendar_event.updated` (metadata:
  the names of the fields that changed, never their values), `calendar_event.cancelled`. Reading the
  calendar is not audited, as `006`'s case list is not.
- **FR-010**: Times are shown in America/Mexico_City. All-day dates are never converted.
- **FR-011**: An event may carry `remindMinutesBefore` from a fixed set (15, 60, 1440, 2880, 10080).
  `GET /tenant/calendar/reminders` returns the caller-visible, non-cancelled events whose reminder
  time has passed and whose start has not (Decision 2). Nothing is sent anywhere.
- **FR-012**: Title ≤ 200 characters, location ≤ 200, description ≤ 2000; trimmed; title required.
- **FR-013**: The `calendario` navigation item becomes available for MP, AA, PL, CM, SA, and shows
  the reminders count.
- **FR-014**: All copy is Spanish; no colour literals; the new components join
  `spanish-copy.test.tsx`; the capability rows join both mirrors and their sync tests.

### Capability Matrix *(Principle IV — two rows added, 44 and 45)*

| # | Capability | Scope | MP | AA | PL | CM | BM | SA | PO |
|---|---|---|---|---|---|---|---|---|---|
| 44 | `calendar.read` — read the firm's calendar and reminders | `tenant` (narrowed by assignment in the query, FR-006) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 45 | `calendar.manage` — create, edit, cancel events | `tenant` (plus the case check of FR-007) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

Row 44 is `tenant`, not `assigned`, for the reason `006`'s row 29 is: a resolver returns a boolean,
and a person with no assignments must get an empty-of-case-events calendar, not a refusal.

### Key Entities

- **Calendar event**: type, title, optional description and location, all-day date(s) or timed
  instant(s), optional case, optional reminder, status (scheduled / cancelled), who created it
  (membership), when.

---

## Success Criteria *(mandatory)*

- **SC-001**: An associate sees this month's hearings on opening `/calendario`, with no more than one
  events request per month shown.
- **SC-002**: A member not on a case never receives that case's events — asserted by an isolation
  test against the live database, not only by the controller.
- **SC-003**: No event is ever deleted; every create, edit and cancel writes exactly one audit entry.
- **SC-004**: An event with a reminder appears in "Recordatorios" once its reminder time passes and
  leaves it at its start.
- **SC-005**: An all-day deadline shows on the same date in any browser time zone.

---

## Decisions taken under delegation

All recorded 2026-09-23 by Claude under the CC technical lead's delegation; each is reversible and
listed for his review.

### Decision 1 — Creating and editing events are in (US02, US03 pulled into MVP)

A calendar with no way to add an event is empty; the only other source (court sync) is IT3. So
create, edit and cancel ship here. Recurring events (`US09`), filters by case (`US05`) and portal
visibility (`US08`) stay out.

### Decision 2 — Reminders are in-app only

No channel can deliver a message. "Recordatorios" is computed on read (no scheduler, no job table):
an event is in it when `now ≥ start − reminder` and `now < start`. When a provider exists, a sender
reads the same predicate; nothing here has to change.

### Decision 3 — Event types are fixed, not a firm catalog

Four types that every Mexican firm uses and that the product may one day treat specially (a
`deadline` is what a future "plazos" report counts). A firm catalog like `006`'s would let the
vocabulary drift per firm before anything relies on it.

### Decision 4 — Two capabilities, same holders, BM excluded

`calendar.read` and `calendar.manage` are split so a future read-only role costs a matrix edit, not
a migration. BM is excluded from both because case-linked events are matter content (the reason
`006` excludes BM from cases).

### Decision 5 — No attendees yet

Inviting specific members needs notifications to mean anything; without a channel, an attendee list
would be decoration. Events are firm-visible (or case-team-visible, FR-006).

---

## Assumptions

- `006`'s `case_assignment` (live rows, `unassigned_at IS NULL`) is the source of "on the case".
- The firm's time zone is America/Mexico_City for every firm in the MVP.

## Out of Scope

Court-portal sync (`US06`, IT3), Google/Outlook export (`US10`, IT3), recurring events (`US09`),
filtering by case (`US05`), client-portal visibility (`US08`), notification preferences (`US07`),
attendees, and any message delivery.

## Approval Checklist

- [x] Zero `[NEEDS CLARIFICATION]` markers — every open point is a delegated decision above
- [x] Permission matrix declared (rows 44–45) with scope reasoning
- [x] Decisions 1–5 taken under the CC technical lead's delegation of 2026-09-23 — **for his review**
- [ ] `master-user-story-catalog.md` amended: US02 and US03 of EP05 moved to MVP by this slice
