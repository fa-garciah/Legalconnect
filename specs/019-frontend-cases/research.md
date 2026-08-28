# Research — The Case Register

**Feature**: `019-frontend-cases` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Seven decisions. D1 and D7 are the pair that matter; the rest are ordinary.

---

## D1 — The three filters are three more entries in the array that already holds the assignment predicate

**Decision.** `q`, `matterTypeId` and `venueId` are pushed onto the same `conditions: SQL[]`
that `CaseRepository.list` already builds, joined with `AND` into the same `WHERE`, evaluated
before the same `LIMIT`. Nothing about the existing assignment `EXISTS` moves, and nothing
about the cursor predicate moves.

```
conditions = [
  EXISTS (assignment …)        ← already there, unless MP/SA
  cursor predicate             ← already there, when paging
  q predicate                  ← new
  matter type predicate        ← new
  venue predicate              ← new
]
WHERE <joined with AND>  ORDER BY …  LIMIT n+1
```

**Rationale.** The method is already written in exactly this shape, and `006`'s own
`ClientRepository.list` — eight files away in the same module — already adds a name filter
and a status filter to an identical array with an identical `sql.join(conditions, AND)`. The
`ILIKE '%' || $1 || '%'` form is taken from there too, including its stated reason: a firm
searching for a matter knows a fragment, not a prefix.

**What the `q` predicate covers.** File number **or** client legal name, so the two are one
`OR` *inside a single parenthesised condition*:

```
(c.file_number ILIKE '%'||$q||'%' OR cl.legal_name ILIKE '%'||$q||'%')
```

The parentheses are the whole of the danger. An unparenthesised `OR` at the top level of a
list joined by `AND` binds looser than intended and dissolves the assignment predicate —
`EXISTS(...) AND a OR b` is `(EXISTS(...) AND a) OR b`, and `b` alone returns other people's
matters. `sql.join(..., AND)` composes whole conditions, so a condition that contains an `OR`
must arrive already parenthesised. D7 tests exactly this.

The design's placeholder also says "o descripción". **There is no description field** on a
case in `006`. The placeholder is corrected rather than the schema extended.

**Alternatives considered.**

- *Filter in the service, after fetching.* Rejected for the reason `006` already documented
  for its own list: filtering after the fetch turns a page of 50 into a page of 7 while
  `nextCursor` goes on claiming 50 more.
- *Filter in the browser.* Forbidden by `018/FR-003`, for the same reason one step further
  out.
- *A separate search endpoint.* More surface, another route to authorise, and no benefit —
  the filters and the paging have to agree, so they belong in one query.

---

## D2 — The badge reads `isClosing` from the catalog the screen already fetches

**Decision.** The register fetches the firm's `case-statuses` catalog once per screen and
joins it to each row by status id. A status the firm has declared as closing gets one
treatment; every other status gets the other. Two treatments, no third.

**Rationale.** `isClosing` is not on the list item — `006` returns `status: { id, name }`
there — and it is the only semantic the catalog carries. Two ways to get it:

| | Cost | |
|---|---|---|
| Fetch the catalog, join by id | one request per screen, zero per row | **chosen** |
| Add `isClosing` to the list item's status object | zero requests, but widens the contract change | rejected |

The catalog is chosen because the screen needs catalogs anyway — matter types and venues for
the two filter selects, statuses for the create form and the status change — so the join is
free, and it keeps Decision 1's contract change bounded at exactly three query parameters.
A bounded contract change is easier to review than a slightly cheaper one.

**Degradation.** If the catalog read fails while the list succeeds, every badge falls back to
the neutral treatment and the register still renders. The spec lists this as an edge case;
this is the behaviour it names.

**Alternatives considered.**

- *Colour by status name.* This is the thing Q3 exists to forbid. A per-tenant catalog of
  free text means *Concluido* is one firm's word and *Archivado* is another's.
- *Four colours from an urgency flag.* `006` has no urgency. Adding one is a product decision
  about what urgent means and who declares it; `US05-EP02-CSM` stays unclaimed.

---

## D3 — One deliberate open equals exactly one audit entry, and the query options are what guarantee it

**Decision.** The opened case is fetched with a query whose `refetchOnWindowFocus`,
`refetchOnMount` and `refetchOnReconnect` are all off, and whose `staleTime` is `Infinity`
for the life of the panel. Closing the panel unmounts it; reopening the same case issues a
new read, and that is correct — it is a second deliberate access.

**Rationale.** `GET /tenant/cases/:caseId` writes a `case.read` audit entry on every
interactive call (`006/FR-023`). The defaults in this application's query client refetch on
window focus, so a reader who alt-tabs away and back would silently write a second access
entry for a case they opened once. SC-005 says one open, one entry; that is a statement about
the audit log's trustworthiness, not about network efficiency.

The panel therefore treats the record as a snapshot taken at open. Anything that changes it —
a status change — invalidates it explicitly, which is a deliberate re-read and legitimately
audited.

**Alternatives considered.**

- *Leave the defaults and accept extra entries.* Rejected: Principle V's whole point is that
  the log means something, and an access log that counts window focus is a log nobody can
  reason about.
- *Suppress the audit for refetches with the automated channel header.* That header exists for
  machine callers; using it to hide a human's refetch would be lying to the audit log.

---

## D4 — The register must never fetch a case record, for any reason

**Decision.** A prohibition, written here so it survives a well-meaning optimisation. The
register renders **only** from the list response and the catalogs. It does not fetch a case
record per row, does not prefetch on hover, does not prefetch the first row, and does not
warm the cache for likely clicks.

**Rationale.** Every one of those is a normal, sensible frontend technique, and every one of
them writes audit entries. Prefetch-on-hover in particular would produce an access log that
records matters a person's cursor passed over — which is both false and, on a register of
legal matters, actively misleading.

This is the requirement Q2's resolution protects: with no Abogado column there is no reason
to reach for the detail route from a list row, so the temptation is removed rather than
resisted. Recorded anyway, because the next slice to add a column will feel it again.

**Verification.** SC-005 is an end-to-end assertion: load a register of fifty, count audit
entries, expect zero.

---

## D5 — A date-only value is never parsed into a `Date`

**Decision.** `openedOn` and `closedOn` arrive as `YYYY-MM-DD` and are rendered by splitting
the string, not by constructing a date object.

**Rationale.** This is a real defect and a quiet one. `new Date('2026-03-04')` is parsed as
UTC midnight; rendered in Mexico City, `toLocaleDateString` gives **3 March**. Every case in
the register would show the wrong opening date, off by one, and only for firms west of
Greenwich — so it would look correct to a developer in Europe and wrong to every actual user.

`006` stores these as `date`, not `timestamptz`, precisely because they are calendar days
rather than instants. The frontend must not promote them to instants on the way to the
screen.

**Alternatives considered.**

- *Append `T00:00:00` to force local parsing.* Works, and depends on a reader knowing why the
  suffix is there. Splitting the string is self-evident.
- *A date library.* Not worth a dependency for reformatting six characters, and the same trap
  exists inside most of them if handed a bare date string.

---

## D6 — The create form's client picker searches the server

**Decision.** The client field is a searching combobox backed by `018`'s existing
`listClients({ q })`, debounced, not a `<select>` of every client.

**Rationale.** A firm's client list is unbounded and already paged; a select would either
truncate silently or fetch everything. `018` already built and tested the search this needs,
including the rule that a whitespace-only term is absent rather than a filter matching
nothing.

Permission composes: `case.create` is held by `MP`, `CM` and `SA`, all of whom hold
`client.read` (row 25), so anyone who can reach this form can populate its picker.

**The three catalog pickers are plain selects**, because a firm's statuses, matter types and
venues are a curated list of a size a person chose — that is what makes them a catalog rather
than a table.

**Only active entries are offered** (FR-035). A retired entry still *resolves* on an existing
case (`006/FR-020`) and must not be offered for a new one; the two are different questions
and the catalog read distinguishes them.

---

## D7 — The isolation test is written first, and it tests the shape rather than the feature

**Decision.** `backend/tests/integration/case-filter-scoping.test.ts`, written and observed to
fail before any filter predicate exists. It seeds two matters in one tenant — one the
associate is assigned to, one they are not — and asserts that **no value of any filter, in any
combination, returns the unassigned matter**.

The cases it must contain, and why each is not redundant:

| Case | What breaks it |
|---|---|
| `q` matching the unassigned matter's file number | an unparenthesised `OR` in the `q` predicate |
| `q` matching the unassigned matter's client name | the same, on the other side of the `OR` |
| `q` matching both matters | a filter that replaced the assignment predicate rather than joining it |
| `matterTypeId` of the unassigned matter | a predicate placed outside the `WHERE` |
| `venueId` of the unassigned matter | the same |
| all three at once | a `sql.join` with the wrong separator |
| every filter empty | a regression that drops the assignment predicate when no filter is set |
| the same, as `MP` | the opposite regression — an over-eager filter that hides matters from someone entitled to all of them |

**Rationale.** The user asked for this explicitly, and the reason it is separate from the
filtering tests is that the two fail differently. A filtering test asks *did I get the right
rows*; this one asks *did I get rows I was never entitled to*. The first can pass while the
second fails — a broken `OR` returns a superset, and a superset contains all the right rows.

**Why the risk is smaller than it sounds, and why the test still earns its place.** The
method's existing shape makes the correct implementation the natural one: append to
`conditions`, and `sql.join(..., AND)` does the rest. The failure requires someone to write
the `q` predicate without parentheses, or to restructure the method. Both are exactly the
kind of thing a later refactor does. Tenant isolation is on the constitution's non-negotiable
coverage list, and this predicate is the first thing in the product to be added to a query
that filters by assignment.

**Where it runs.** Testcontainers against real PostgreSQL, as the caller — so RLS is active
and the assignment predicate is doing its own work rather than being simulated.
