# Phase 0 — Research: Firm Directory

**Feature**: `017-firm-directory` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Constitution**: v1.4.0

---

## D1 — `directory_entry` rows are created lazily, never by a trigger on `membership`

**Decision.** No row exists for a membership until its position is first assigned.
`GET /tenant/directory` `LEFT JOIN`s `membership` to `directory_entry` to `position`;
an absent `directory_entry` row and a present one with `position_id IS NULL` both read
as "no position assigned." Assigning a position for the first time is an upsert
(`INSERT ... ON CONFLICT (membership_id) DO UPDATE`), not an insert that assumes no
row exists.

**Rationale.** FR-014 forbids altering 002's `membership` table or its semantics. A
`BEFORE/AFTER INSERT` trigger on `membership` that auto-creates a `directory_entry` row
would not touch a *column*, but it would attach new behaviour to a table 002 owns and
tested without it — exactly the kind of coupling FR-014 exists to prevent, and the
kind 004 itself avoided when it chose an interceptor over reaching into `membership`'s
own write path. A lazily-created row needs no trigger and no coordination with
`accept_invitation()` (002, `backend/drizzle/0015`).

**Consequence — the re-invitation edge case resolves for free.** `accept_invitation()`
always mints a new `membership.id` (002's own design: a fresh membership per acceptance,
never a resurrected one). Since `directory_entry.membership_id` is a foreign key to one
specific membership row, a new membership after re-invitation has no `directory_entry`
row pointing at it — it starts with "no position assigned," not by special-cased logic,
but because the foreign key simply does not resolve to anything until someone assigns
one. Spec.md's edge case list asks exactly this question; this is the answer, and it
falls out of the schema rather than needing its own branch anywhere.

**Alternative rejected.** A trigger on `membership` INSERT creating a zero-position
`directory_entry` row eagerly. Rejected per FR-014's spirit above, and because it buys
nothing: the lazy read already treats "no row" and "row with `position_id = NULL`"
identically, so eager creation has no observable effect except coupling to a table this
slice does not own.

---

## D2 — The default seed is inserted per tenant at provision time, not read from a shared constant

**Decision.** `backend/drizzle/seed.ts` (dev/CI seed data) inserts the five-entry
default catalog (Socio, Asociado Senior, Asociado, Pasante, Paralegal — spec.md,
Resolved Decisions) for each tenant it creates. In production, the same insert runs
wherever `001`'s tenant-provisioning path already writes a tenant's first rows —
extending that write, not adding a second provisioning mechanism.

**Rationale.** Explicitly *not* a product-wide constant the way 004's `MATRIX` is
(004, Decision 4) — Principle III places this exactly at the tenant-configuration layer,
so "the seed" must become five ordinary, independently-editable rows the moment they
exist, not a template a tenant "inherits" and cannot fully own. A shared constant read
at request time would risk the seed silently reappearing after a tenant retires every
entry (edge case, spec.md) if the read path ever fell back to it — inserting real rows
once, at provisioning, closes that off entirely.

**Alternative rejected.** A `DEFAULT` catalog looked up by absence-of-rows at read time.
Rejected: it reintroduces exactly the shared-constant risk above, and makes "does this
tenant have zero positions because it retired everything, or because nothing was ever
seeded" ambiguous — a real distinction spec.md's edge cases ask about directly.

---

## D3 — Capability and audit-action naming

**Decision.**

| Row | Capability id | Audit action |
|---|---|---|
| 22 | `directory.assign_position` | `directory.position_assigned` |
| 23 | `directory.manage_catalog` | `position.created`, `position.retired` |
| 24 | `directory.read` | *(none — a read, not a mutation)* |

`directory.manage_catalog` covers both adding and retiring a position with one
capability, matching spec.md's own framing of row 23 as "define the position catalog"
(singular), not two separate rows for two lifecycle transitions of the same entity —
consistent with how 004 itself uses one capability (`membership.change_archetype`) for
a value that can move in either direction.

**Rationale.** `module.verb` matches every existing id in `004/src/common/authz/
capability.ts` and the `audit_event.action` vocabulary's own shape (004, D1), so the
two registries continue to read alike.

---

## D4 — No rename endpoint; retirement is the only lifecycle transition besides creation

**Decision.** A position's name is set once, at creation. There is no
"edit an existing position's name" endpoint. Renaming a rank a firm no longer wants
under its old name is: retire the old entry, create a new one with the new name.

**Rationale.** Spec.md's own User Story 2 acceptance scenarios name exactly two
mutations — add (scenario 1) and retire (scenario 3) — and FR-007 says a position
"carries a name and an active-or-retired status," describing the two facts a row holds,
not a third operation that changes the first fact in place. Inventing a rename endpoint
the spec never asked for is the same speculative-scope failure mode Decision 2 (in
spec.md) already declined for a second catalog — building a capability with no
acceptance scenario behind it. If renaming-in-place turns out to matter, it is a
one-row addition to `capability.ts`/`matrix.ts` later, following the same FR-021/FR-016
discipline every other slice already does.

**Consequence for the historical record.** A retired-then-recreated name change means
existing `directory_entry` rows keep pointing at the *retired* row (correct — a
directory entry references the exact position a member held, per FR-008's own
"remain valid on every directory entry that already references it"), and new
assignments pick the fresh row. No migration of existing assignments happens, by design.

---

## D5 — No lock for concurrent position assignment; ordinary last-write-wins

**Decision.** Assigning a position is a plain `UPDATE`/`UPSERT`, no `SELECT ... FOR
UPDATE`, no application-level retry loop. Two concurrent assignments to the same
membership resolve to whichever `UPDATE` commits last — an ordinary database
serialization outcome, not a race this slice defends against.

**Rationale.** Contrast deliberately with 004's last-`SA` trigger (004, research.md
D5), which needed `FOR UPDATE` because *some* outcomes of a race are invalid (zero live
`SA`s). Here, every reachable outcome of a race — either of the two positions ending up
assigned — is a valid state; the spec names no invariant a race could violate (unlike
SC-009 in 004, there is no "0 sequences must leave X" success criterion here). Locking
against a race with no invalid outcome would be unjustified complexity.

**Alternative rejected.** Optimistic concurrency (a version column, refusing a stale
write). Rejected for the same reason — no success criterion asks for it, and it would
add a refusal path (409) the spec's User Story 1 does not describe.

---

## D6 — Name collision: active positions only, case-insensitive, per tenant

**Decision.** Creating a position is refused if the tenant already holds an *active*
position whose trimmed name matches case-insensitively (Postgres `citext`-style
comparison via a functional unique index: `UNIQUE (tenant_id, lower(trim(name))) WHERE
status = 'active'`). A retired position's name is free to reuse.

**Rationale.** Spec.md's edge cases ask this directly: "same position name added twice
— case-insensitive collision, or two distinct entries?" A silent duplicate ("Asociado"
and "asociado " as two different rows) would make the assignment dropdown (slice 014's
future UI) show two visually-identical choices with no way for a person to tell them
apart — worse than refusing the second insert outright. Restricting the constraint to
`status = 'active'` is what makes D4's retire-then-recreate-with-the-same-name pattern
legal, which a tenant may reasonably want to do (un-retiring a rank by another name is
out of scope, but re-adding the exact same name after retiring it is not).

**Alternative rejected.** Case-sensitive uniqueness only. Rejected: "Asociado" and
"asociado" reading as the same rank to a human is the far more common case a Mexican
law firm's own data entry would produce, and the cost of the stricter comparison is a
functional index, not a new mechanism.
