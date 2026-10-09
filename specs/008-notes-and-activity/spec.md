# Feature Specification: Case Notes and Case Activity

**Feature Branch**: `008-notes-and-activity`
**Created**: 2026-10-09
**Status**: Decided — eight decisions taken by Claude 2026-10-09, pending ratification by Jero;
**Decision 1 also requires Felipe's sign-off** (privilege)
**Input**: `registro-specs-mvp.md` row for `008-notes-and-activity` (EP14 US01/02/05, EP02 US11/12,
**BLOQUEADO** on note visibility), `plan-paralelo-2026-09.md` §4 ("Decisión de *counsel*, no de
ingeniería"), and the MVP-closing brief of 2026-10-09, which asks for that block to become a
Decision with a recommendation rather than stay a blocker.

> **Citation convention.** Requirements of slices 004, 006, 007, 009, 013, 015, 016a, 020, 021 and
> 022 are cited as `006/FR-0NN` etc. Bare `FR-0NN` refers to this document. Code is cited as
> `path:line`, read on 2026-10-09 at `main` `3809e1a`.
>
> **Authorship.** Written by Claude (Opus 5.5) on 2026-10-09, end to end. Every open point is a
> numbered Decision marked *"Decided by Claude 2026-10-09 — pending ratification by Jero"*. Decision 1
> decides how a privileged document is handled and therefore **also needs Felipe (counsel)**: it is
> marked so, and nothing in this slice may be merged to `main` before both have signed it.

---

## Why this slice matters

A matter is more than its documents and its dates. The partner's call with the client, the
associate's read of the judge, the paralegal's note that the court clerk asked for a certified copy:
today that lives in email and paper, and nowhere in the product. **Case notes** are where it goes.

The second half is memory: *who did what on this matter, and when?* — the status change last
Tuesday, the brief uploaded on Friday, the hearing moved. **Case activity** answers it. And it can
answer it without a new store, because the product already records every one of those changes in
its append-only audit log (Principle V). This slice reads that record back, per matter, minimised.

Notes are attorney work product, covered by professional privilege. That is why this slice was
blocked: whether a client could ever read a note is a privilege question, not an engineering one.
Decision 1 recommends the only answer the product can give while `EP13` (the client portal) is
unvalidated — **never, not yet** — and builds it so that changing it later is an explicit,
per-note act with a safe default.

---

## What the code actually does, checked against the code rather than the catalog

`case.repository.ts`, `assigned-scope.resolver.ts`, `common/audit/actions.ts`,
`common/audit/interceptor.ts`, `0006_grants.sql`, `0048_time_entry.sql`, the case-core, documents and
calendar controllers, `drizzle/seed-demo.ts`, `tests/unit/demo-no-mfa-bypass.test.ts` and
`frontend/src/app/expedientes/*` were read before this spec was written. Nine findings shape it.

| # | What the stories assume | What the code does | Consequence |
|---|---|---|---|
| 1 | Notes exist somewhere | **Nowhere.** No table, column or route in 48 migrations stores free text about a matter | The entity is new → **FR-001**, migration `0049` |
| 2 | Activity needs its own table | **It does not.** `lc_app` already holds `SELECT` on `audit_event` under RLS (`0006_grants.sql:15`), and every change to a matter, its team, its documents and its events is already written there, one row per mutation | Activity is a **read** over the audit log → Decision 2 |
| 3 | The audit log says which matter an entry is about | Only sometimes. `case.*` actions target the `case_file` itself; team changes target the **membership** and carry the matter in `metadata.caseId` (`case-assignment.controller.ts:53`, `:87`); documents and calendar events target their own rows, whose `case_id` is the link | The feed query joins per target entity → **FR-012** |
| 4 | Audit metadata is safe to display | It carries **previous and new values**: status ids `{from, to}` (`case.controller.ts:155-156`), outcomes (`:191-192`), document categories (`documents.controller.ts:171`) | The feed shows *what kind* of change, never its values → **FR-014**, Decision 2 |
| 5 | Every audited action belongs in a feed | No. `case.read`, `document.previewed`, `document.downloaded` are **access** records (`actions.ts:54`, `:78-79`), and `time_entry.*` are one person's own hours (009 Decision 2) | A fixed allow-list of mutations → **FR-013** |
| 6 | An audit entry names a person | It names a `membership`; **no slice stores a person's name** (015 Decision 10) | The feed labels the actor by position, as 015's workload chart does → **FR-015** |
| 7 | The demo firm will show activity | **It cannot, honestly.** The demo seed is forbidden to write `audit_event` (`demo-no-mfa-bypass.test.ts:127-131`: "fixture setup is not a user journey") | The feed of a demo matter starts empty and fills as people act → Decision 5 |
| 8 | Writes on a matter need their own reach check | They do not. Since `fix-cross-tenant-fk-oracle`, 006's `assigned` resolver checks — for every archetype, MP and SA included — that the named matter exists in the caller's firm (`assigned-scope.resolver.ts`) | Every route is nested under `:caseId`; no service re-checks reach → **FR-005** |
| 9 | A notes screen needs a navigation entry | No section in the navigation is per-matter; per-matter screens hang off the case panel (`CaseDetailPanel.tsx:204`, "Documentos") | Notes and activity are reached from the case panel; there is **no navigation flag to flip** → **FR-018** |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Write down what happened on a matter (Priority: P1) 🎯 MVP

An associate comes back from a hearing and writes, on the matter, what the judge said.

**Catalog**: `US01-EP14-NOT-CreateCaseNote` (MVP).

**Independent Test**: as the demo AA on a matter they are on, open the matter's notes, write a note,
see it at the top of this month.

**Acceptance Scenarios**:

1. **Given** an `MP`, `AA`, `PL` or `CM` who reaches the matter, **When** they write a note and save,
   **Then** it appears at the top of the current month, with its time and the author's position.
2. **Given** an empty or whitespace note, or one over 5,000 characters, **Then** it is refused before
   sending and by the server (`400`).
3. **Given** a matter the person is not on (and they are not `MP`), **Then** writing answers `404`,
   identical to a matter that does not exist (006/FR-016).
4. **Given** another firm's real matter id, **Then** the answer is byte-identical to a made-up one
   — the shared oracle table asserts it.
5. **Given** a note, **Then** it is internal: nothing in the product offers to show it to a client
   (Decision 1).

### User Story 2 — Read a matter's notes, month by month (Priority: P1) 🎯 MVP

A partner reviewing a matter reads its notes, newest month first.

**Catalog**: `US02-EP14-NOT-ViewNoteHistoryByMonth` (MVP).

1. **Given** notes on a matter, **When** someone who may read them opens the notes, **Then** they are
   grouped by Mexico City month, newest first, each with date, time, author position and text.
2. **Given** a month selector, **When** a month is chosen, **Then** only that month is requested.
3. **Given** a `BM` or an `SA`, **Then** there is no notes control on the case panel and the routes
   refuse them (Decision 6).
4. **Given** the list is read, **Then** exactly one access entry is recorded (`note.list_read`, for an
   interactive read only), naming the matter and carrying no note text (Decision 4).

### User Story 3 — Fix a note while it is fresh (Priority: P2)

**Catalog**: `US03-EP14-NOT-EditOwnNote` — **narrow version promoted IT2 → MVP** (Decision 3).

1. **Given** one's own note, written less than 24 hours ago, **When** it is corrected, **Then** the
   new text replaces the old and the audit entry records that it changed — never either text.
2. **Given** the same note, **When** it is deleted and confirmed, **Then** it leaves the list; the row
   is kept, voided.
3. **Given** a note older than 24 hours, or somebody else's, **Then** neither control is drawn, and
   the server answers `409 correction_window_closed` or `404` respectively.

### User Story 4 — Every note change is in the audit log (Priority: P2)

**Catalog**: `US05-EP14-NOT-AuditNoteChanges` (MVP).

1. **Given** a note is created, corrected or voided, **Then** exactly one audit entry is written —
   `note.created`, `note.corrected`, `note.voided` — with the note as target, and no note text in it.

### User Story 5 — See what happened on a matter (Priority: P2)

A case manager opens a matter's activity and sees, newest first: the status changes, who was put on
or taken off it, the documents uploaded, recategorised, withdrawn and restored, the events
scheduled, changed and cancelled, the notes written, corrected and deleted.

**Catalog**: `US11-EP02-CSM-ViewCaseActivityFeed` (MVP) and `US12-EP02-CSM-FilterActivityByMonth`
(MVP).

1. **Given** a matter the person reaches, **When** they open its activity, **Then** they see the
   current month's changes, newest first, each as a Spanish sentence with when and who (by position).
2. **Given** a month selector, **When** a month is chosen, **Then** only that month's changes are
   requested and shown (`US12`).
3. **Given** a status change, **Then** the entry says the status changed — **not** from what to what
   (Decision 2, minimisation). Likewise outcome, category and team role.
4. **Given** someone read the matter, previewed or downloaded a document, or recorded hours, **Then**
   that is **not** in the feed.
5. **Given** a matter the person is not on, or another firm's, **Then** `404`, as for notes.
6. **Given** a demo matter nobody has touched through the product, **Then** the feed is empty and
   says so — the demo seed never invents history (Decision 5).

### Edge Cases

- **A month boundary**: a note written at 23:30 Mexico City time on the 31st belongs to that month.
- **A note on a matter the author is later taken off**: it stays on the matter; the author can no
  longer read or correct it (the resolver refuses them); colleagues still on it see it.
- **A team change**: its target is a membership, and its matter lives in `metadata.caseId`; the feed
  reads that key — and only that key — from the metadata.
- **A document or event that is later withdrawn or cancelled**: its earlier entries stay in the feed;
  history is not rewritten.
- **Audit entries with no actor membership** (platform-surface actions): never about a matter, so
  never in a matter's feed.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A `case_note` belongs to one firm (`tenant_id`, RLS, registered in
  `TENANT_SCOPED_TABLES`), to one of its matters (`case_id`, required, immutable), and to its author
  (`author_membership_id`, always the creating caller).
- **FR-002**: A note's body is plain text, trimmed, 1–5,000 characters.
- **FR-003**: A note carries `visibility`, which **admits only `internal`** (a `CHECK`), default
  `internal` (Decision 1). No route accepts it as input.
- **FR-004**: Notes are never deleted: "Eliminar" sets `status = voided` and `voided_at`; `lc_app`
  holds no `DELETE` on the table.
- **FR-005**: Every route is nested under `/tenant/cases/:caseId/…` with an `assigned`-scoped
  capability and `@ScopeTarget('caseId')`; 006's resolver alone decides reach (firm-checked for
  every archetype). An unreachable, unknown or foreign matter answers the same `404`.
- **FR-006**: New capabilities (Principle IV): `note.read` and `note.create` and `note.correct_own`
  — `MP`, `AA`, `PL`, `CM`; `case.read_activity` — `MP`, `AA`, `PL`, `CM`, `SA`. `BM` holds none
  (Decision 6).
- **FR-007**: `GET /tenant/cases/:caseId/notes?month=YYYY-MM` returns the matter's non-voided notes
  of that Mexico City month (default: the current one), newest first, each with `correctableUntil`
  computed by the server, and the author's position.
- **FR-008**: `POST /tenant/cases/:caseId/notes` creates one; `PATCH …/notes/:noteId` corrects the
  body; `POST …/notes/:noteId/void` voids it. Correction and void: own note, not voided, within 24 h
  of creation — else `404` (not own), `409 note_voided`, `409 correction_window_closed`.
- **FR-009**: Four audit actions: `note.created`, `note.corrected` (metadata `{ changed: ['body'] }`
  only), `note.voided` — one per mutation — and `note.list_read`, one per **interactive** notes-list
  read (channel-gated), targeting the matter, with metadata `{ month }` only. No audit entry ever
  carries note text.
- **FR-010**: `GET /tenant/cases/:caseId/activity?month=YYYY-MM` returns the matter's activity for
  that Mexico City month, newest first, at most 200 entries, derived from `audit_event` under RLS.
  It is not audited (Decision 4).
- **FR-011**: The month parameter is `YYYY-MM`; a malformed one is `400`.
- **FR-012**: An audit entry belongs to a matter when: its target is that `case_file`; or its target
  is a membership and `metadata->>'caseId'` is that matter; or its target is a `document`,
  `calendar_event` or `case_note` whose `case_id` is that matter.
- **FR-013**: Only these actions appear, by an explicit allow-list: `case.created`,
  `case.status_changed`, `case.outcome_declared`, `case.team_member_assigned`,
  `case.team_member_unassigned`, `document.uploaded`, `document.category_changed`,
  `document.withdrawn`, `document.restored`, `calendar_event.created`, `calendar_event.updated`,
  `calendar_event.cancelled`, `note.created`, `note.corrected`, `note.voided`. Any other action —
  accesses, hours, anything added later — is absent until a slice adds it here on purpose.
- **FR-014**: Each feed entry carries `action`, `occurredAt`, the actor's `membershipId` and
  `position`, and — for documents only — the document's file name (already visible on the matter's
  documents page to the same people). It carries **no** metadata values: no previous/new status,
  outcome, category or role, and never note text.
- **FR-015**: The actor is labelled by position (`directory_entry` → `position`), never by email
  (015 Decision 10).
- **FR-016**: The case panel links "Notas" and "Actividad" for those who hold `note.read` and
  `case.read_activity` respectively, as it links "Documentos" today.
- **FR-017**: `/expedientes/:caseId/notas` and `/expedientes/:caseId/actividad` render inside
  `016a`'s shell with `020`'s tokens, `016a`'s loading/error/empty states, Spanish copy, no colour
  literal, and every control drawn from `can()`.
- **FR-018**: No navigation entry changes: both screens are per matter (finding #9).
- **FR-019**: `022`'s demo seed writes realistic notes (idempotent, date-free ids, only by people on
  each matter, a few recent enough to be correctable) and **writes no audit row** (Decision 5).
- **FR-020**: The five new write routes join `foreign-reference-oracle.test.ts`'s shared table.

### Capability Matrix *(Principle IV — four rows added, 52 to 55)*

| # | Capability | Scope | MP | AA | PL | CM | BM | SA | PO | Portal |
|---|---|---|---|---|---|---|---|---|---|---|
| **52** | **`note.read`** — read a matter's notes | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **53** | **`note.create`** — write a note on a matter | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **54** | **`note.correct_own`** — correct or void one's own note within 24 h | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **55** | **`case.read_activity`** — read a matter's activity | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |

All four are `assigned` and nested under `:caseId` — unlike 009's own-timesheet read there is no
cross-matter list, so there is no `tenant`-scoped row. Read / write / delete / export: the four
holders read and write notes on reachable matters and **void** their own within 24 h (never
physical delete); nobody exports. None is step-up gated or tier-keyed (cross-cutting).

### Key Entities

- **Case note**: matter, author (membership), body, visibility (internal), status (active / voided),
  created and voided instants.
- **Activity entry** (not stored — a read over `audit_event`): action, when, actor's membership and
  position, and for documents the file name.

---

## Success Criteria *(mandatory)*

- **SC-001**: An associate writes a note on a matter in under 20 seconds from opening it.
- **SC-002**: No person reads or writes a note on a matter they do not reach, and no response tells
  another firm's matter apart from a made-up id — asserted against the live database.
- **SC-003**: No note text appears in any audit row, and no previous/new value appears in any feed
  entry — asserted over every action in the allow-list.
- **SC-004**: Every note mutation writes exactly one audit row; every interactive notes-list read
  writes exactly one `note.list_read`; the activity read writes none.
- **SC-005**: A change made through the product appears in its matter's feed on the next read.
- **SC-006**: A `BM` sees neither link and is refused by every route; an `SA` sees activity, not notes.
- **SC-007**: Zero colour literals and zero English strings in the new frontend files.

---

## Decisions

Every decision below was taken rather than deferred. **Decided by Claude 2026-10-09 — pending
ratification by Jero.** Decision 1 additionally **requires Felipe's sign-off**.

### Decision 1 — Notes are internal work product; client visibility would be an explicit, per-note act *(requires Felipe — privilege)*

**Options**: (A) notes visible to the client through `EP13`; (B) notes strictly internal, with no
path to visibility in the schema; (C) **notes strictly internal now, with a per-note `visibility`
flag that exists, admits only `internal`, and defaults to it**.
**Taken: C.**
**Why internal**: a note is the attorney's working thought about a matter — strategy, assessments
of the other side, things said in confidence. It is attorney work product under professional
privilege. `EP13` (the portal) is unvalidated and has no onboarding flow (Recognised Technical Debt
2 and 3), so there is no client to show it to, and no counsel decision that one should be shown.
**Why a flag now, constrained to one value**: the day a firm wants to share a note, it must be a
deliberate act on **that** note, never a property of all notes — and the default must be the safe
one. Putting the column in now, with a `CHECK` that admits only `internal`, makes the future change a
reviewed migration that widens the `CHECK` (and a counsel decision recorded beside it), instead of a
silent default someone flips. No route accepts the field today.
**Rejected**: A (a privilege decision taken by engineering, for a portal that does not exist); B
(correct today, but leaves the future change to be designed under pressure).
**Replaces** the catalog's `[NEEDS CLARIFICATION]` on EP14 with a pointer here.

### Decision 2 — Activity is derived from the audit log, minimised; no second store

**Options**: (A) a separate `case_activity` table written alongside each mutation; (B) **a read over
`audit_event`**, scoped to the matter, with an allow-list of actions and no metadata values.
**Taken: B.**
**Why**: the audit log already holds exactly the record US11 asks for, written by the global
interceptor on every mutation (Principle V), append-only and tamper-resistant. A second table would
be a second, weaker copy of the same facts — written by each module, able to drift, and needing its
own isolation and retention story. Reading the audit log means the feed can never claim something
happened that the evidentiary record does not show.
**Read path**: `GET /tenant/cases/:caseId/activity`, `case.read_activity` (`assigned`, through the
resolver), RLS on `audit_event` scoping it to the firm, one query joining per target entity
(FR-012), one Mexico City month at a time, at most 200 entries.
**Which actions**: an explicit allow-list of **mutations** (FR-013). Not accesses — a feed that told
the team who opened which document would turn an evidentiary log into workplace surveillance. Not
hours — 009 decided time is visible only to its author.
**Minimisation**: the audit metadata carries previous and new values (finding #4). The feed shows
*that* a status changed, never from what to what; the person who wants the current state opens the
matter. Note text never leaves the notes route; for documents, the feed names the file, which the
same people already see on the documents page.
**Cost accepted**: a status change reads "cambió el estado" rather than "pasó de En Proceso a
Concluido". The values are one click away, on the matter itself, under its own access rules.

### Decision 3 — A narrow note correction is promoted to MVP

**Taken**: own notes, within 24 hours of writing, body only; "Eliminar" voids. `US03-EP14` is amended
in the catalog to "MVP (narrow, 008 Decision 3)". This is exactly 009's Decision 3, **ratified by
Jero on 2026-10-09**, applied to notes for the same reason: a record with no way to fix a typo is
defective, and after a day the note is the firm's record.
**Separate capability (row 54)** so withdrawing the decision is a matrix edit.

### Decision 4 — Reading a matter's notes is an audited access; reading its activity is not

**Taken**: one `note.list_read` per **interactive** read of a matter's notes (channel-gated, target =
the matter, metadata `{ month }`); no audit entry for the activity feed.
**Why notes are audited**: Principle V requires recording *access to* notes. The product's line so
far: opening one matter is an access (`006/FR-023`, `case.read`); listing documents is not
(`007/FR-021`), because a document list discloses names, not contents. A notes list is different in
kind — **it discloses the notes' full text**. Reading it is reading privileged content, which is what
`case.read` exists to record. One entry per read, not per note, and gated to interactive reads as
`case.read` is, so a monitoring job cannot inflate it.
**Why activity is not**: it discloses no content — kinds of change, when, by which position — and it
is itself a read of the audit log; auditing it would make every look at the feed add to the feed's
own source.

### Decision 5 — The demo seed writes notes, never history

**Taken**: `022`'s demo seed writes notes on demo matters; it writes **no** `audit_event` row. A
demo matter's activity starts empty and fills as people act through the product.
**Why**: the audit log is evidentiary (Principle V). A fixture that wrote audit rows would put
fabricated history in the one table whose value is that it is never fabricated —
`demo-no-mfa-bypass.test.ts` forbids it, rightly. The feed is demonstrated by doing things.
**Cost accepted**: notes written by the seed do not appear in the feed (they were not written
through the product); the quickstart demonstrates the feed by acting first.

### Decision 6 — Who: the four archetypes who work matters; `SA` sees activity, not notes; `BM` neither

**Taken**: `note.*` — `MP`, `AA`, `PL`, `CM`. `case.read_activity` — those four and `SA`.
**Why `SA` reads no notes**: a system administrator runs the firm's tool; privileged work product is
not theirs to read, and least privilege grants nothing a role does not need. `SA` keeps the activity
feed, which discloses no content and supports their operational role (`SA` already reads every
matter's record under 006 Decision 2).
**Why `BM` gets nothing**: matter content, as for cases, documents, calendar and hours.

### Decision 7 — Months are Mexico City months

As `013`, `015` Decision 7 and `009` Decision 6: a note at 23:30 on the 31st belongs to that month.

### Decision 8 — Notes and activity live on the matter, not in the navigation

Both screens are per matter and reached from the case panel, like documents (finding #9). A
firm-wide notes view would aggregate privileged text across matters — a separate question for a
separate story.

---

## Assumptions

- 006's `case_assignment` and the firm-checked `assigned` resolver are the single source of reach.
- `audit_event` keeps its current shape; `metadata.caseId` remains the key team changes use.
- A matter has at most a few hundred activity entries in a month; 200 per request is a ceiling,
  stated in the response when reached.

## Dependencies

`006` (cases, team, resolver), `004` (matrix and its tests), `001` (RLS, audit interceptor,
no-context sweep), `007`/`013` (documents and events whose rows the feed joins), `009` (the ratified
correction precedent and the oracle table), `015` (positions as labels), `016a`/`020` (shell, states,
tokens), `022` (the demo seed).

## Out of Scope

Note visibility by role (`US04-EP14`, IT2), corrections after 24 h, rich text or attachments in
notes, a firm-wide notes view, client-facing activity reports (`US13-EP02`, IT2), showing
previous/new values in the feed, and any client visibility of notes (Decision 1).

## Approval Checklist

- [ ] Decision 1 — notes internal; per-note flag admitting only `internal` — *Decided by Claude 2026-10-09, pending ratification by Jero **and Felipe (privilege)***
- [ ] Decision 2 — activity derived from the audit log, allow-listed, minimised — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 3 — narrow note correction promoted to MVP (009 D3 precedent) — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 4 — notes-list read audited (interactive), activity read not — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 5 — demo seed writes notes, never audit history — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 6 — notes MP/AA/PL/CM; activity also SA; BM nothing — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 7 — Mexico City months — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 8 — per-matter screens, no navigation entry — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [x] Checked against the code — nine findings above
- [x] Permission matrix declared (rows 52–55) with Principle IV's four verbs
- [x] Catalog amended in this PR: EP14 `[NEEDS CLARIFICATION]` → Decision 1; `US03-EP14` → MVP (narrow); still-open item 5 resolved pending ratification
- [x] Zero `[NEEDS CLARIFICATION]` markers
