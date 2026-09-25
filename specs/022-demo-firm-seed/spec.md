# Feature Specification: The Demo Firm Seed

**Feature Branch**: `022-demo-firm-seed`
**Created**: 2026-09-25
**Status**: Decided — nine decisions taken by Claude 2026-09-25, pending ratification by Jero
**Input**: On a fresh stack nobody can sign in, and the data behind the screens is too thin to
read. `drizzle/seed.ts` writes identities with no credential and no second factor; `015` and `023`
are about to render dashboards and lists over three cases and one document that has no bytes.

> **Citation convention.** Requirements of slices 001, 002, 003, 006, 007, 013, 016a, 017 and 021
> are cited as `003/FR-0NN` etc. Bare `FR-0NN` refers to this document. Code is cited as
> `path:line` and was read at the commit this branch starts from.
>
> **Authorship.** Written by Claude (Opus 5) on 2026-09-25, end to end. Every open point is
> resolved as a numbered Decision rather than deferred as a clarification; each carries
> *"Decided by Claude 2026-09-25 — pending ratification by Jero"*. Nothing here is approved.

---

## Why this slice matters

**A product nobody can sign into cannot be demonstrated, and a product that cannot be
demonstrated cannot be sold.** That is not a figure of speech about this repository. It is the
literal state of `main`:

- `drizzle/seed.ts` creates two identities and two memberships, and creates **no
  `identity_credential` row and no `identity_factor` row** (`drizzle/seed.ts:140-170`). The
  sign-in path resolves a credential digest; there is none to resolve. No seeded person can
  authenticate.
- `scripts/demo-invitation.ts` exists solely to work around this, and says so in its own header:
  *"on a fresh local stack there is NO path by which a human becomes a signed-in user. This script
  is the crutch."* It also records that the seeded invitations cannot be redeemed either, because
  their `reference_hash` is the literal string `seed-reference-<tenantId>`, *"which is not the
  SHA-256 of anything"* (`scripts/demo-invitation.ts:1-20`).
- The gap is not hypothetical and not historical. On **2026-09-25**, getting one person signed in
  on this machine required hand-writing an `identity_credential` and an `identity_factor` straight
  into the database through a throwaway script. That is the current onboarding experience for a
  developer, a reviewer, or anybody being shown the product.

The second half of the problem is volume. `015-kpi-dashboard` is about to compute active matters,
resolution time and load per attorney; `023-firm-documents` is about to list, filter and search a
firm's documents. Today the whole firm is **two clients, three cases — all in one status, none
with a matter type, none closed — one assignment, and one document whose bytes were never written
to the object store** (`drizzle/seed.ts:298-457`). Screens built against that data cannot be
judged: an empty chart and a broken chart look identical.

This slice makes a fresh stack a place where the product can be *seen*: a fictional firm with
people who can actually sign in, six quarters of matters, and documents that really open.

---

## What the code actually does, checked against the code rather than its comments

`drizzle/seed.ts`, `drizzle/migrate.ts`, `scripts/demo-invitation.ts`,
`src/modules/auth/enrollment.service.ts`, `src/common/auth/*`, `src/common/db/schema.ts` and
`src/common/storage/object-store/*` were read before this spec was written. Eight findings
change what this slice must build.

| # | What a reader would assume | What the code does | Consequence for this slice |
|---|---|---|---|
| 1 | `npm run db:seed` produces users who can sign in | Inserts `identity` and `membership` only — no `identity_credential`, no `identity_factor`, no `backup_code` (`seed.ts:140-170`) | The demo seed must write all three, the way enrollment does → **FR-002**, **FR-003** |
| 2 | `identity.mfa_enrolled_at` being set means an enrolled factor exists | The seed sets `mfa_enrolled_at = now()` with no `identity_factor` row (`seed.ts:141-152`), while `enrollment.service.ts:174-182` writes the two together under the comment *"THE TWO MUST NOT DIVERGE"* | Today's seed leaves the database in a state the application can never produce. The demo seed writes `confirmed_at` and `mfa_enrolled_at` together → **FR-004** |
| 3 | A seeded document can be previewed or downloaded | Only the metadata row is written — *"no bytes are written to object storage"* (`seed.ts:407-414`) — and its `storage_key` ends in the literal `fixture`, which `buildObjectKey` would reject, since every segment must be a UUID (`object-store.port.ts:45-54`) | Demo documents need real objects at keys the production path would produce → **FR-008**, **FR-009** |
| 4 | `tenant.storage_bytes_used` reflects what is stored | The document insert never touches it, though the column is *"read live on every upload check"* and *"never decremented by withdrawal"* (`schema.ts:88-91`) | The demo seed must maintain the counter, and over **every** document row including withdrawn ones → **FR-010** |
| 5 | The seed exercises some variety | 2 clients and 3 cases per tenant; every case takes the same `En Proceso` status id; `matter_type_id`, `venue_id` and `closed_on` are never set; exactly one `case_assignment` exists (`seed.ts:298-371`) | Nothing for `015` to aggregate: no closed matter, no matter-type spread, no per-attorney load → **FR-005**, **FR-006** |
| 6 | The seeded archetypes cover the product | The only memberships are `MP` in tenant A and `IC` in tenant B (`seed.ts:156-169`) — and `IC` is a **portal** archetype (Constitution Principle IV) | No `AA`, `PL`, `CM`, `BM` or `SA` exists to sign in as, so no permission-matrix row can be seen on a screen → **FR-001** |
| 7 | One seed command is the right place for demo data | `db:seed` is the fixture seed the isolation suite leans on: `no-context.test.ts` sweeps every registered tenant-scoped table and needs each one non-empty while a tenant is active — the control that makes its "zero rows after release" result meaningful rather than vacuous (`seed.ts:407-415`, `seed.ts:280-289`) | Demo volume must not land under that suite. A separate command → **Decision 1**, **FR-014** |
| 8 | `loadEnvFile` is a shared helper | It is copy-pasted four times: `drizzle/migrate.ts:17-28`, `drizzle/seed.ts:30-40`, `scripts/demo-invitation.ts:27-38`, `tests/setup-env.ts:33-45` | A fifth copy is not acceptable; the three `drizzle/` copies collapse into one → **FR-015** |

Two facts that constrain *how*, recorded so the plan does not rediscover them:

- **The auth tables are unreachable from `lc_app` by design.** `schema.ts:528-539`: *"lc_app holds
  no privilege at all on the first three of these… A Drizzle table object compiles fine and the
  query it builds is refused by PostgreSQL with `permission denied` — which is the intended and
  tested behaviour."* The demo seed therefore runs on the **migration** connection, the standing
  that `seedIdentitiesAndMemberships` already has (`seed.ts:121-126`).
- **There is already a precedent for refusing to run in a deployed environment.**
  `src/common/auth/deployment-assertions.ts` is a `NODE_ENV` **deny-list** (not an allow-list, so a
  new environment name inherits the safe behaviour), raising a named error, with the comment
  *"THERE IS NO OVERRIDE FLAG, and there must never be one."* Decision 3 reuses that shape rather
  than inventing a second one.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sign in on a fresh stack, as any internal archetype (Priority: P1) 🎯 MVP

A developer clones the repository, brings up Postgres, migrates, seeds, runs one more command, and
signs in as a partner. Then signs out and signs in as a paralegal to see the same product with
fewer controls.

**Catalog**: `US22-EP00-FND-SeedDemoFirm` (FND) — added to `master-user-story-catalog.md` in this
slice's own PR, on the precedent `016a` set for `US17`–`US20` and `020` set for `US21`
(Principle I).

**Why this priority**: every other story in every other slice is unreachable without it. A screen
that cannot be opened cannot be reviewed, and today no screen can be opened.

**Independent Test**: on a database that has only been migrated and seeded, run
`npm run db:seed:demo`, take the printed email, password and TOTP secret, and sign in through the
browser to a working shell — with no SQL typed by hand.

**Acceptance Scenarios**:

1. **Given** a migrated and seeded database, **When** `npm run db:seed:demo` runs, **Then** it
   prints one line per demo person — email, archetype, position — plus the shared password and each
   person's TOTP secret, and exits `0`.
2. **Given** the printed credentials for Alejandro Méndez, **When** they are used at `/ingresar`,
   **Then** the password is accepted, a TOTP challenge is issued, a code derived from the printed
   secret is accepted, and the shell renders with `MP`'s navigation.
3. **Given** the same for Mariana Torres (`PL`), **When** she signs in, **Then** the shell renders
   `PL`'s narrower navigation and no upload-forbidden control appears — the permission matrix is
   visible on screen for the first time.
4. **Given** a wrong TOTP code, **Then** sign-in is refused exactly as for any other identity: the
   demo seed installs no bypass, no skip flag and no relaxed factor (**FR-013**).
5. **Given** the command is run a second time, **Then** it changes nothing, prints the same
   credentials, and exits `0` (**FR-014**).
6. **Given** the person who holds two memberships, **When** they sign in, **Then** the tenant
   switcher offers both firms and each shows only its own matters.

---

### User Story 2 — A firm whose numbers are worth looking at (Priority: P2)

A partner opens the KPI dashboard and the case register and sees a firm with history: matters
opened across six quarters, some closed, spread across practice areas, with visibly uneven load
between the two associates.

**Catalog**: supports `US01-EP06-KPI-ViewOverallKPIs` and `US02-EP06-KPI-MonitorWorkloadDistribution`
(both `015`), and `US01-EP02-CSM` / `US01-EP03-CLM`'s existing screens.

**Independent Test**: after the demo seed, `GET /tenant/cases` returns matters whose `opened_on`
spans the last six quarters, whose `case_status_id` is not all the same, where at least one case
has `closed_on` set, and where the two `AA` memberships hold visibly different numbers of `lead`
assignments.

**Acceptance Scenarios**:

1. **Given** the demo firm, **Then** it has roughly 25 clients, a mix of `organization` and
   `person`, none of them a real company (**FR-005**).
2. **Given** the demo firm, **Then** it has roughly 40 matters spread across the six seeded matter
   types, across `En Proceso` / `En Espera` / `Concluido`, opened across the last six quarters
   (**FR-006**).
3. **Given** a matter whose status is `Concluido`, **Then** its `closed_on` is set and is later
   than its `opened_on` — so a resolution time can be computed at all (**FR-006**).
4. **Given** the two associates, **Then** their `lead` assignment counts differ, and at least
   three matters carry **no** assignment for either of them — so an `AA` signing in sees a
   register shorter than the firm's own (**FR-007**).
5. **Given** the calendar, **Then** the firm has upcoming and past events of more than one type,
   some linked to a matter and some firm-wide (**FR-011**).

---

### User Story 3 — Documents that actually open (Priority: P3)

A case manager opens a matter's documents, previews a PDF inline, downloads an image, and neither
one fails at the object store.

**Catalog**: supports `US02-EP04-DOC-PreviewDocumentInline` and
`US09-EP04-DOC-DownloadDocumentEasily`, shipped by `021`.

**Independent Test**: pick any seeded document, call `…/preview`, follow the signed URL, and
receive real bytes with the expected content type — then confirm the firm's
`storage_bytes_used` equals the sum of its documents' `size_bytes`.

**Acceptance Scenarios**:

1. **Given** the demo firm, **Then** it has roughly 130 documents distributed unevenly across its
   matters, filed under the firm's own categories (**FR-008**).
2. **Given** any seeded document, **Then** an object exists in the store at the key the production
   upload path would have produced, holding a small but **valid** file of its declared MIME type
   (**FR-009**).
3. **Given** the seeded documents, **Then** `tenant.storage_bytes_used` equals the sum of
   `size_bytes` over **all** of the firm's document rows, withdrawn ones included (**FR-010**).
4. **Given** at least one withdrawn document, **When** an `MP` opens the withdrawn list, **Then**
   it is there and can be restored — `021`'s Decision 2 path has a fixture at last.
5. **Given** the command is re-run, **Then** no duplicate object is written and no key changes
   (**FR-014**).

---

### User Story 4 — The command refuses to run against anything but a local database (Priority: P4)

Somebody with production credentials in their shell runs the demo seed by mistake. Nothing
happens.

**Why the lowest priority still blocks the slice**: priority here orders *value*, not *risk*. This
story is last because nobody asks for it, and it is non-negotiable because the command's whole
purpose — writing known credentials for known people — is a catastrophe anywhere real.

**Independent Test**: run the command with `NODE_ENV=production`, and again with a
`DATABASE_URL_MIGRATION` pointing at a non-local host. Both refuse, non-zero, writing nothing.

**Acceptance Scenarios**:

1. **Given** `NODE_ENV` of `production` or `staging`, **When** the command runs, **Then** it exits
   non-zero with a named error and executes no statement (**FR-012**).
2. **Given** a `DATABASE_URL_MIGRATION` whose host is not a loopback or a well-known local Docker
   host, **Then** the same refusal, whatever `NODE_ENV` says (**FR-012**).
3. **Given** any combination of environment variables, **Then** there is no value that switches
   either check off — no `--force`, no `ALLOW_DEMO_SEED` (**FR-012**, Constitution *"a mechanism
   whose only purpose is to switch a protection off must not exist"*).
4. **Given** a refusal, **Then** the message names what is wrong and what a local setup looks
   like, and never prints a connection string (Principle VI).

---

### Edge Cases

- **Run before `db:migrate`**: a table is missing. The command fails on the first statement with
  the migration's name in the message rather than a raw Postgres error.
- **Run before `db:seed`**: the three plans do not exist, so the demo firm cannot be given one.
  The command creates its own firms and does not depend on `db:seed`'s two tenants
  (Decision 8) — but it does need the `plan` rows, so it seeds the plan it uses if absent.
- **Run twice concurrently**: the second run sees the first's rows through the same `ON CONFLICT`
  guards and writes nothing. No statement depends on a read-then-write gap outside a transaction.
- **The object store is unreachable** (MinIO down, or `OBJECT_STORE_*` unset): every database row
  is still written, the objects are reported as skipped, and the command exits non-zero saying
  which documents have no bytes. It must not leave a silent half-state (**FR-016**).
- **`quay.io` is blocked, so MinIO cannot be pulled at all** — the state of this machine on
  2026-09-25. Then FR-016's path is the only one available, and `quickstart-results.md` records
  which document assertions could not run.
- **A demo person's email collides with a real identity** in a developer's database: `identity`
  has a normalized-email unique index (`schema.ts:149`). The demo domain is
  `@demo.legalconnect.mx`, which cannot collide with the `@example.com` fixtures.
- **A firm renames or retires a demo category**: the seed does not put it back. It inserts only
  where absent, exactly as the default catalogs do (`position-catalog.seed.ts`'s note on not
  resurrecting a catalog a firm emptied).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The demo firm MUST have one sign-in-able person per internal archetype: `MP`, `AA`
  (two of them), `PL`, `CM`, `BM` and `SA` — seven memberships, each with a `directory_entry`
  carrying a position from the firm's catalog.
- **FR-002**: Every demo person MUST have an `identity_credential` holding a real Argon2id digest
  produced by `hashCredential` (`common/auth/argon2.ts:58`) — never a literal, never a hash
  computed by any other path.
- **FR-003**: Every demo person MUST have a confirmed `identity_factor` whose secret is wrapped by
  `resolveKeyProvider()` (`common/auth/key-provider.ts:187`), and ten `backup_code` rows sharing
  one `set_id`, digested with `hashHighEntropy` — the same three writes
  `enrollment.service.ts:177-197` performs.
- **FR-004**: `identity_factor.confirmed_at` and `identity.mfa_enrolled_at` MUST be written
  together, never one without the other.
- **FR-005**: The firm MUST have ~25 clients, a mix of `organization` and `person`, with **no real
  company or real person's name**, and RFCs that satisfy `tenant`/`client`'s shape constraint.
- **FR-006**: The firm MUST have ~40 matters spread across the six default matter types, across
  all three default statuses, with `opened_on` distributed over the last six quarters, and
  `closed_on` set on every matter whose status is a closing status and on no other.
- **FR-007**: Assignments MUST be uneven: the two `AA` memberships hold different `lead` counts,
  and at least three matters carry no assignment for either.
- **FR-008**: The firm MUST have ~130 documents, unevenly distributed across matters, filed under
  the firm's categories, including at least one `withdrawn` document.
- **FR-009**: Every seeded document MUST have a real object in the store, written through
  `ObjectStorePort.put` at a key from `buildObjectKey`, holding a valid small file matching its
  declared MIME type — PDF and PNG, generated in code, never a binary committed to the repository.
- **FR-010**: After the command, `tenant.storage_bytes_used` MUST equal the sum of `size_bytes`
  over all of that tenant's document rows, withdrawn included (`007/FR-015`'s semantics).
- **FR-011**: The firm MUST have calendar events of more than one type, past and future, some
  linked to a matter and some not, satisfying `calendar_event`'s one-shape constraint.
- **FR-012**: The command MUST refuse to run when `NODE_ENV` is a deployed environment **or** when
  the migration connection's host is not local, with no override of either check, writing nothing
  on refusal.
- **FR-013**: The command MUST NOT introduce any way to bypass MFA, relax a factor, or sign in
  without a second factor. A demo person authenticates exactly as a real one does.
- **FR-014**: The command MUST be idempotent: a second run changes no row, writes no duplicate
  object, and prints the same credentials.
- **FR-015**: `loadEnvFile` MUST exist once for `drizzle/`, imported by `migrate.ts`, `seed.ts` and
  the new command, rather than copied a fourth time.
- **FR-016**: If the object store is unreachable, the command MUST still write every row, report
  each document whose bytes are missing, and exit non-zero.
- **FR-017**: The generated data MUST be deterministic: the same command on two machines produces
  the same names, numbers, dates and distributions, from a fixed seed rather than `Math.random()`.
- **FR-018**: The credentials and TOTP secrets MUST be printed by the command **and** documented in
  `quickstart.md`, and MUST be derivable from material committed in the repository as readable
  phrases rather than stored as high-entropy blobs (Decision 2).
- **FR-019**: All demo-visible content — firm name, people, clients, matter titles, categories,
  positions, event titles — MUST be Spanish (Merge Rules: Spanish for anything client-facing);
  identifiers, code and this spec stay English.
- **FR-020**: The command MUST print nothing that Principle VI forbids: no connection string, no
  Argon2id digest, no wrapped secret, no backup-code digest. The plaintext backup codes of a demo
  person MAY be printed, because they are fixture material for a database the guard has already
  proved is local.

### Capability Matrix *(Principle IV)*

**This slice adds no capability, exposes no endpoint, and changes no permission.** It is a
command-line fixture writer running on the migration connection. The matrix section is therefore a
declaration of what the demo *data* makes reachable, which is the thing a reviewer actually needs
to check — and the reason this table exists at all is finding #6 above: today no internal archetype
except `MP` can be exercised on a screen.

| Demo person | Archetype | Position (firm catalog) | What signing in as them demonstrates |
|---|---|---|---|
| Alejandro Méndez | `MP` | Socio | The full internal surface; the only archetype that can withdraw a document |
| Laura Ramírez | `AA` | Asociado Senior | Assigned scope: a register shorter than the firm's |
| Jorge González | `AA` | Asociado | The same, with a different and smaller load |
| Mariana Torres | `PL` | Paralegal | Upload without `change_category`; no withdraw |
| Rocío Villalobos | `CM` | Coordinadora de Casos | `change_category` without `withdraw` |
| Sergio Pantoja | `BM` | Administrador | **Holds no document capability at all** — the archetype `023` must remove from the documents nav |
| Ivonne Carrasco | `SA` | Administrador de Sistemas | `/configuracion`, and the shortest session budget (30 min idle) |
| Laura Ramírez *(same identity)* | `MP` in the second firm | Socia | One person, two firms, two archetypes — `001/FR-021`, and the tenant switcher's only real fixture |

Verified against `common/authz/matrix.ts:101-110` and `capability.ts:100-108` on 2026-09-25: `BM`
holds none of the eight `document.*` capabilities.

### Key Entities

- **Demo firm** — a `tenant` row like any other. Two of them: one full
  (*Despacho Méndez & Asociados, S.C.*) and one deliberately sparse
  (*Bufete Ríos y Caballero, S.C.*), so cross-tenant isolation is visible rather than asserted.
- **Demo person** — an `identity` plus a `membership`, plus the three auth rows FR-002/FR-003
  require, plus a `directory_entry`.
- **Demo matter** — a `case_file` with a client, a status, a matter type, an `opened_on` and,
  when closed, a `closed_on`; plus zero or more `case_assignment` rows.
- **Demo document** — a `document` row **and** the object its `storage_key` points at.

---

## Success Criteria *(mandatory)*

- **SC-001**: On a database that has only been migrated and seeded, a person signs in through the
  browser in under two minutes from `npm run db:seed:demo`, with no SQL typed by hand.
- **SC-002**: All seven internal archetypes can sign in, and each sees the navigation its archetype
  entitles it to.
- **SC-003**: Running the command twice changes no row and writes no duplicate object — asserted
  by comparing full-table checksums before and after the second run.
- **SC-004**: Every seeded document's preview URL returns bytes whose length equals the row's
  `size_bytes`, and `storage_bytes_used` matches the sum over all rows.
- **SC-005**: The command refuses, writing nothing, under `NODE_ENV=production`,
  `NODE_ENV=staging`, and a non-local database host — and no environment variable makes it proceed.
- **SC-006**: `grep` over the repository finds no way to disable the MFA challenge for a demo
  person; `test:auth-coverage` stays green, unedited.
- **SC-007**: Two machines running the command against empty databases produce identical row
  counts, file numbers, dates and assignment distributions.
- **SC-008**: `test:isolation`, `test:rls` and `verify:role` stay green **unedited** — the demo
  command is outside the fixture set those suites read, which is the point of Decision 1.
- **SC-009**: Secret scanning stays green: nothing the repository commits for this slice looks
  like a credential to `gitleaks`, because the committed material is readable phrases (Decision 2).

---

## Decisions

Every decision below was taken rather than deferred. **Decided by Claude 2026-09-25 — pending
ratification by Jero.**

### Decision 1 — A separate command, never folded into `db:seed`

**Taken (A)**: a new script and a new script entry, `npm run db:seed:demo`, leaving
`drizzle/seed.ts` untouched in behaviour.
**Why**: `db:seed` is not a convenience — it is the fixture set the isolation suite reads.
`no-context.test.ts` sweeps every registered tenant-scoped table and requires each non-empty while
a tenant is active; `seed.ts` documents that this is *"what makes its 'zero rows after release'
assertion a real regression test rather than vacuously true"*. Folding ~200 demo rows and ~130
objects into it would put demo volume under a security suite, slow every CI run, and make a
failure there ambiguous between "isolation broke" and "the demo data changed".
**Rejected (B)**: a flag on `db:seed` (`--demo`). One script with two personalities, and the
isolation suite one environment variable away from reading demo data.
**Rejected (C)**: an HTTP endpoint. A route that mints known credentials is exactly the mechanism
Constitution's *"must not exist to be misused"* language forbids.

### Decision 2 — A fixed password and *derived* TOTP secrets, both documented

**Taken**: one shared password for every demo person, and a TOTP secret per person **derived
deterministically from a readable phrase** committed in the source (base32 of
`demo-totp-<slug>`), printed by the command and written into `quickstart.md`.
**Why**: a random secret printed once is lost the moment the terminal scrolls, and the next person
re-runs the seed or writes another throwaway script — which is how this slice's own problem was
worked around on 2026-09-25. Fixed material is the whole point: a demo you can return to
tomorrow. Deriving from a phrase rather than committing a base32 blob keeps CI's secret scanner
honest (SC-009) and keeps a reader able to see there is no secret here, only a fixture.
**Why it is not a Principle VI violation**: Principle VI forbids secrets in the repository. This
is not secret material — it is fixture material for a database Decision 3's guard has already
proved is local, on the same standing as `POSTGRES_PASSWORD: lc_migration_dev` in
`docker-compose.yml` and `TEST_CREDENTIAL` in `tests/helpers/auth-seed.ts:15`. The guard is what
makes that true, which is why these two decisions are inseparable.
**Rejected**: random-per-run secrets printed once (unusable); a `.env`-supplied password (a second
configuration surface for a fixture).

### Decision 3 — Fail closed on two independent checks, with no override

**Taken**: the command refuses if `isDeployedEnvironment()` (`NODE_ENV` in `{production,
staging}`) **or** if the migration connection's host is not in `{localhost, 127.0.0.1, ::1,
host.docker.internal, postgres}`. Two independent checks, either sufficient to refuse, neither
overridable, raising a named error before any statement runs.
**Why two**: each covers the other's blind spot. `NODE_ENV` is unset far more often than it is
wrong, so it alone would permit a run against a production URL from a laptop. A host check alone
would permit a run inside a deployed container that reaches its database over a local socket. The
realistic accident is a developer with a production `DATABASE_URL` in their shell, and only the
host check catches that one.
**Why an allow-list of hosts but a deny-list of environments**: inverted deliberately, each in the
fail-closed direction. A new environment name (`preprod`) must inherit refusal, so environments are
a deny-list — copied from `deployment-assertions.ts:26-32`, which reasons this out. A new host name
must inherit refusal too, so hosts are an allow-list.
**Rejected**: a `--force` flag, an `ALLOW_DEMO_SEED=1` escape, a confirmation prompt. The
constitution's reasoning about MFA applies verbatim: *"a mechanism whose only purpose is to switch
this off must not exist to be misused, misconfigured or wrongly defaulted."*

### Decision 4 — Real bytes, generated in code

**Taken**: the command writes a minimal valid single-page PDF and a minimal valid PNG, both
constructed in TypeScript, through `ObjectStorePort.put` at `buildObjectKey` keys.
**Why**: `021` ships preview and download, and neither can be seen working against a row with no
object. Generating the bytes keeps binaries out of the repository, keeps every file a handful of
bytes, and keeps `size_bytes` honest, since it is measured from the buffer actually written.
**Why through the port**: `object-store.port.ts:1-7` makes that the only permitted seam —
*"No file outside `common/storage/object-store/` may import `@aws-sdk/*` (verified by T049)"*. A
seed that bypassed it would break a contract test and, worse, drift from the app's own config.
**Rejected**: committed sample files (binaries in git, and a `size_bytes` that can drift from the
object); metadata-only rows (today's broken state); a converter or real-looking documents (out of
scope, and a fabricated legal document is worse than an obviously synthetic one).

### Decision 5 — Deterministic identity for every generated row

**Taken**: one fixed-seed PRNG drives every choice, and every row's identity is derived from a
stable natural key — `file_number` for matters, `legal_name` for clients (the list is asserted
duplicate-free), and a **deterministic UUID** for documents, derived from the firm's RFC, the file
number and the document's index, so `storage_key` is stable across runs.
**Why**: idempotency (FR-014) and reproducibility (FR-017) are the same requirement seen from two
sides, and both fail without stable identity. A random document id would write a new object on
every run and litter the bucket — the failure mode that matters most, because the store has no
`DELETE` grant for anything but upload rollback (`object-store.port.ts:27`).
**Rejected**: `ON CONFLICT DO NOTHING` on random ids (writes duplicate objects); truncating the
firm's tables first (destructive on a developer's own data, and `lc_app` holds no `DELETE` on
`document` by design).

### Decision 6 — The demo firm owns catalog entries the defaults do not provide

**Taken**: the demo firm adds its own `position` rows (*Coordinadora de Casos*, *Administrador*,
*Administrador de Sistemas*) and its own `document_category` rows (*Demanda*, *Contestación*,
*Resolución*, *Anexo*, *Recurso*, *Dictamen*), on top of the defaults its provisioning seeded.
**Why**: the default catalogs are firm-agnostic by requirement (Principle III) and the defaults
have no entry for a non-attorney staff member, so `CM`, `BM` and `SA` would have no position to
hold. Adding rows *to one tenant's own catalog* is precisely what those catalogs are for —
`position-catalog.seed.ts` calls its entries *"five ordinary rows the firm owns outright and may
rename or retire on day one."* Nothing firm-specific enters the product core.
**Rejected**: extending the default catalogs (Principle III violation — a demo firm's staffing
becoming every firm's); leaving `CM`/`BM`/`SA` position-less (`017`'s directory screen then has
nothing to show for three of seven people).

### Decision 7 — Case outcomes are `015`'s to fill, not this slice's to invent

**Taken**: this slice writes no case outcome, because the column does not exist yet.
`015-kpi-dashboard` adds it as a `006` data-model change and, in the same slice, **amends this
command** to fill outcomes for closed matters. `015`'s `tasks.md` carries that task explicitly.
**Why**: `015` stacks on `023` which stacks on this branch, so the ordering is a fact, not a
preference. The alternative is inventing the column here, in a slice whose spec does not justify
it, which is exactly the "a `plan.md` cannot introduce requirements absent from its `spec.md`"
failure Principle I describes — one slice earlier.
**Consequence recorded honestly**: until `015` lands, this firm's closed matters have no outcome
and a success rate cannot be computed from them. `015`'s spec must not read as though the data
were already there.
**Rejected**: adding the column here (unbacked by this spec); having `015` write its own second
demo seed (two seeds, guaranteed drift — the mistake `017` and `006` both record having made with
their catalogs).

### Decision 8 — Two demo firms, the second one deliberately thin

**Taken**: the command creates both of its own firms — *Despacho Méndez & Asociados, S.C.* (full)
and *Bufete Ríos y Caballero, S.C.* (a handful of clients and matters) — and gives one identity a
membership in each, with a different archetype in each.
**Why a second firm at all**: the tenant switcher `016a` shipped and `002` proved has never had a
fixture a human could see working, and "isolation is enforced" is a claim a reviewer should be able
to *check* by switching firms and watching the data change. A different archetype in each is
`001/FR-021`'s multi-tenancy claim made visible.
**Why not reuse `db:seed`'s tenants**: depending on them would couple the demo command to the
fixture seed's contents, so a change to either breaks the other — and would make the demo command
fail on a database seeded in a different order. Independence is what lets Decision 1 hold.
**Why thin**: a second full firm doubles the runtime and the reviewing effort to demonstrate
nothing the first does not already demonstrate. Sparse is also a more honest test: it is what a
firm looks like on its first week.

### Decision 9 — `scripts/demo-invitation.ts` stays

**Taken**: the crutch script is not deleted.
**Why**: it exercises a different path — the real accept-invitation ceremony, where a person sets
their own credential (`accept-invitation.service.ts`). This command writes credentials directly, so
it *cannot* cover that flow, and the two are complements rather than duplicates. Its header note —
*"Delete it the day the email provider lands"* — still names the right trigger, and that day has
not come.
**Rejected**: deleting it (loses the only walkthrough of invitation acceptance); folding it in (two
purposes, one command, per Decision 1's reasoning).

---

## Assumptions

- `npm run db:migrate` has already run. The command asserts the tables it needs exist and says so
  plainly if they do not; it does not run migrations itself.
- Postgres reachable on the migration connection, on a local host per Decision 3.
- MinIO reachable at `OBJECT_STORE_*` for FR-009. When it is not — the state of this machine on
  2026-09-25, `quay.io` refusing the MinIO image — FR-016's degraded path is exercised instead and
  `quickstart-results.md` records exactly which assertions could not run.
- `AUTH_LOCAL_KEY` is set (it is, in `.env.example`), so `resolveKeyProvider()` returns the local
  provider in development. FR-003 works unchanged under KMS.
- The Spanish names invented here resemble no real firm, person or company. They were chosen to be
  plainly synthetic.

## Dependencies

- `003-authentication-mfa` — `argon2.ts`, `totp.ts`, `key-provider.ts`, `backup-codes.ts`, and the
  enrollment write order this command mirrors. Shipped.
- `006-client-case-core`, `007-document-management`, `013-calendar-core`, `017-firm-directory` — the
  tables and default catalogs this command fills. All shipped.
- `001-tenant-foundation` — `plan` and `tenant`, and the provisioning path whose catalog seeding
  this command reuses rather than re-declares.
- `ObjectStorePort` and a reachable object store, for FR-009 only.

## Out of Scope

- **Any product endpoint or UI.** Nothing here is reachable over HTTP, by design (Decision 1C).
- **Case outcomes** — Decision 7, `015`'s.
- **Replacing `drizzle/seed.ts`.** Its two tenants and its fixture rows stay exactly as they are;
  the isolation suite depends on them.
- **Invitation acceptance** — Decision 9, `scripts/demo-invitation.ts`'s.
- **Production or staging use of any kind.** Decision 3 makes that unreachable rather than
  discouraged.
- **Realistic legal document content.** The objects are valid PDFs and PNGs, not plausible
  pleadings. A convincing fake legal document is a liability, not a feature.
- **`no-context.test.ts`'s fixture coverage.** Non-empty-table coverage remains `db:seed`'s job.

## Approval Checklist

- [ ] Decision 1 — a separate `db:seed:demo` command — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 2 — fixed password, phrase-derived TOTP secrets, both documented — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 3 — two fail-closed checks, no override — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 4 — real bytes generated in code, written through the port — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 5 — deterministic identity and a fixed-seed PRNG — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 6 — the demo firm owns extra catalog rows — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 7 — outcomes are `015`'s, which amends this command — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 8 — two firms, the second thin, both created here — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 9 — `scripts/demo-invitation.ts` stays — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [x] Checked against the code, not only its comments — eight findings recorded above
- [x] `US22-EP00-FND-SeedDemoFirm` added to `master-user-story-catalog.md` in this slice's PR
- [x] Permission matrix section states that this slice adds no capability, and declares what the data makes reachable
- [x] Zero `[NEEDS CLARIFICATION]` markers
