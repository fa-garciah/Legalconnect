# Quickstart results — `022-demo-firm-seed`

**Run**: 2026-09-25, on the machine this slice was written on (Windows 11, Node 22.13.1,
PostgreSQL 16 in Docker on port 5455, MinIO **unavailable**).

This file records what was actually verified and what was not. Nothing below is claimed from
a passing sibling suite, a code reading or an earlier slice's notes.

---

## Verified, by running it

### The command works end to end

`npm run db:seed:demo` ran against the local database and produced, confirmed by querying it:

| | Méndez & Asociados | Ríos y Caballero | total |
|---|---|---|---|
| tenants | 1 | 1 | 2 |
| identities (`demo|*`) | — | — | 7 |
| credentials / confirmed factors | — | — | 7 / 7 |
| backup codes | — | — | 70 (ten per person, one `set_id` each) |
| memberships | 7 | 1 | 8 |
| directory entries | 7 | 1 | 8 |
| clients | 25 | 4 | 29 |
| matters | 40 | 5 | 45 |
| closed matters (`closed_on` set) | — | — | 11 |
| case assignments | — | — | 65 |
| documents | 130 | 5 | 135 |
| withdrawn documents | 2 | 0 | 2 |
| calendar events | ~19 | ~3 | 22 |

### Somebody can actually sign in — the slice's whole point

Driven against the running API (`http://127.0.0.1:3001`) as
`alejandro.mendez@demo.legalconnect.mx`:

| Step | Result |
|---|---|
| `POST /auth/sign-in` with the printed password | **201**, `challengeToken` issued |
| `POST /auth/factor` with a code from the printed TOTP secret | **201**, `accessToken` + `refreshToken` |
| `POST /auth/factor` with `000000` | **401** — no bypass exists (FR-013) |
| `GET /identity/memberships` with that token | **200**, `Despacho Méndez & Asociados, S.C.`, archetype `MP` |

This is `SC-001` and the heart of `SC-002`. Before this slice, no seeded identity could reach
step 1 at all.

### The guard refuses, before opening a connection

Asserted in `tests/unit/demo-guard.test.ts` (19 cases): `NODE_ENV` of `production` and
`staging`; hosts `db.prod.internal`, `10.0.0.5`, `*.rds.amazonaws.com`; a missing or
unparseable URL; and `localhost.attacker.example` / `notlocalhost`, which a substring test
would have admitted. The refusal message carries the offending host and **no** connection
string. A source-text assertion additionally pins that no `force`/`allow`/`skip` parameter and
no `ALLOW_*`/`SKIP_*` environment variable exists.

### Idempotency

`tests/integration/demo-seed.test.ts` runs the **real command twice** and compares a
fingerprint over eleven tables plus the storage counter: identical. The printed credentials are
identical too. Confirmed by hand as well — 29 clients after two runs, not 58.

### The storage counter

`tenant.storage_bytes_used` equals `SUM(size_bytes)` over **all** of that firm's document rows,
withdrawn included, for both firms (FR-010). `seed.ts` never touched this column; this is the
first fixture where the counter and the rows agree.

### Suites

| Gate | Result |
|---|---|
| `npm run typecheck` (backend) | **clean** |
| `npm run lint` (backend) | **clean** (it caught four irregular-whitespace errors from zero-width characters I had used to escape `*/` inside a comment; reworded) |
| `npx vitest run tests/unit` | **970 passed / 51 files** (157 of them this slice's, in 11 files) |
| `tests/integration/demo-seed.test.ts` | **22 passed** |
| `tests/contract/demo-sign-in.test.ts` | **5 passed** (all seven people sign in; wrong code and wrong password refused; a challenge token is not an access token) |
| `npm run test:rls` | **33 passed** |
| `npm run verify:role` | **4 passed** |
| `npm run test:auth-coverage` | **32 passed** |
| `npm run build` (backend) | **clean** — and it is what proves the demo material is excluded from `dist/` |
| frontend `tsc --noEmit` | **clean** |
| frontend `npm run lint` | **clean** |
| frontend `npm test` | **639 passed / 75 files** |
| frontend `npm run build` | **clean** |

`test:isolation` and the full `npm test` are reported under **Not verified** below, with the
reason.

---

## Not verified, and why

### `test:isolation` — 3 failures, pre-existing, environmental

`tests/integration/isolation/object-store/pre-signed-url-isolation.test.ts` fails three
assertions (`expected 400 to be 404`, twice, and `expected 400 to be 200`).

**Cause: MinIO is unreachable on this machine.** That test's `beforeAll` performs a real upload
through `POST /tenant/cases/:caseId/documents`; with no object store the upload fails, so
`documentId` is `undefined`, the URL under test becomes `/documents/undefined/preview`, and
`assertUuid` answers **400** instead of the 404/200 being asserted.

**Ruled out as mine, by experiment rather than by argument.** This slice moves
`objectStoreConfig()` out of `DocumentsModule` (T008), which is on that exact code path. So:
the configuration was printed and confirmed correct (`endpoint http://localhost:9000`, `region
us-east-1`, `bucket legalconnect-documents-dev`, `forcePathStyle true`) and the `put` was
observed failing on connection, not on configuration; then the change was **temporarily
reverted** — `documents.module.ts` restored from git and the new config file deleted — and the
same three assertions failed identically. The failures predate this slice.

**Why MinIO is unavailable**: `quay.io` answers `401 Unauthorized` for the pinned
`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` and `quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z`
images, on a direct `docker pull`. Docker Hub pulls succeed (`postgres:16-alpine`,
`hello-world`), so this is not a local proxy problem; it is quay.io refusing anonymous access
to those tags. `minio/minio` no longer exists on Docker Hub, which is why the compose file
points at quay.io in the first place.

**What that leaves unproven for this slice:**

- **FR-009** — that every seeded document has a real object behind it, of the right byte
  length. The bytes themselves *are* verified: `demo-documents.test.ts` asserts the PDF's xref
  offsets each point at their object and re-derives every PNG chunk CRC with an independent
  implementation. What is unverified is only that they were successfully **stored**.
- **SC-004** — preview URLs returning bytes of the expected length.
- The task-list item that would have covered this (T025, `demo-seed-objects.test.ts`) was
  therefore **not written rather than written and skipped**, so that nothing in the suite
  claims coverage that does not exist. It is named here and in `tasks.md` as outstanding.

**What IS verified in that area**: FR-016's degraded path, which is the behaviour this
environment actually exercises. The command wrote all 135 document rows, named the 135 keys it
could not store, and exited **1** (checked directly; an earlier reading of `$?` through a pipe
misreported it as 0).

### `npm test` (the full backend suite) — red, and every failure accounted for

Ran to completion: **1954 passed, 26 failed, 13 skipped, across 201 files (11 failed).**

The 26 failures are **entirely** the MinIO-dependent set, which was established by
measurement rather than assumption. Grepping the test tree for `.attach(` (a real multipart
upload) and for object-store references gives 17 files; six of those need no live store (five
unit tests, which all pass, plus `tests/setup-env.ts`, which is not a test at all). Running the
remaining **eleven** files on their own reproduces
**11 failed files / 26 failed tests / 13 skipped** — the full suite's failure counts exactly:

```
tests/contract/document-access-audited.test.ts
tests/contract/document-category.test.ts
tests/contract/document-read.test.ts
tests/contract/document-upload.test.ts
tests/contract/document-withdraw-restore.test.ts
tests/contract/documents-download-disposition.test.ts
tests/contract/documents-upload-cap.test.ts
tests/contract/documents-withdrawn-list.test.ts
tests/integration/document-category-rename.test.ts
tests/integration/isolation/object-store/pre-signed-url-isolation.test.ts
tests/integration/storage-limit-race.test.ts
```

So: **nothing outside the object-store set fails**, this slice creates or modifies none of
those eleven files, and the one code path where its change could interact was tested with the
change reverted and failed identically (see `test:isolation` above).

**This is a red gate and it is reported as one.** It cannot be made green on this machine: the
MinIO image cannot be pulled at all. CI has the `minio` service, which is where these eleven
files are actually exercised.

### `npm test -- --coverage` (blocking thresholds)

Not run to completion. Reasoning about the risk, which is not the same as measuring it: the
thresholds are 100% on `src/common/tenant/**`, `src/common/audit/**`, `src/common/authz/**` and
`src/modules/case-core/assigned-scope.resolver.ts`. This slice adds **no file under any of
them**. Its one `src/` addition, `src/common/storage/object-store/object-store.config.ts`, is a
verbatim move of an existing function out of `documents.module.ts`, and no threshold covers
either path. The demo generators live under `drizzle/`, which `coverage.include`
(`src/**/*.ts`) excludes — deliberately, and it is the same reason they are excluded from the
build.

### `gitleaks` (SC-009)

**Not run: the tool is not installed on this machine**, and CI runs it as the `secret-scan` job
via `gitleaks/gitleaks-action@v2` (`.github/workflows/ci.yml:230`). There is no `.gitleaks.toml`,
so the default ruleset applies.

Reasoned about rather than measured, and it changed the work: an early draft of `quickstart.md`
transcribed two people's 32-character base32 TOTP secrets and their backup codes. That is
precisely the high-entropy string the default ruleset looks for — and it also contradicted
FR-018's own second clause, which asks for credentials *derivable from readable phrases rather
than stored as high-entropy blobs*. The transcription was removed; the document now carries the
derivation (`sha256("demo-totp-<slug>")` → base32) and the shared password, both readable
phrases, and directs the reader to the command for the ready-to-use values. `grep -E
"[A-Z2-7]{26,}"` over `specs/022-demo-firm-seed/` now returns nothing.

### Manual browser verification of the seeded screens

The API-level sign-in was driven and confirmed. The seeded data was **not** walked through the
browser screen by screen, so nothing here claims that, say, the case register's filters read
well against 40 matters. `015` and `023` build on this data and will exercise it.

### The Companion GUI hooks

`.specify/extensions.yml` registers mandatory `after_specify` / `after_plan` / `after_tasks` /
`after_implement` hooks that write `.spec-context.json`. Each requires `python3`, which is not
installed here. Per those skills' own graceful-degradation contract:
`[companion] Warning: python3 not detected; skipped .spec-context.json capture`. No
`.spec-context.json` was written for this slice.

---

## Tasks not completed

| Task | Why |
|---|---|
| T025 `demo-seed-objects.test.ts` | Needs MinIO. Deliberately not written rather than written-and-skipped, so no suite implies coverage that is absent. |
| T027 `demo-seed-store-unreachable.test.ts` | The behaviour it asserts (FR-016) was verified by running the command in exactly that state, and is asserted inside `demo-seed.test.ts`'s "FR-016 — the object store" block, which handles both cases. A dedicated test pointing at a closed port would duplicate it. |
| T033's `npm test -- --coverage` | See above. |

## Approval state

The nine decisions in `spec.md` are **taken and unratified**. Their Approval Checklist boxes
stay unticked until Jero signs them. Everything in this slice was built on the recommended
option of each.
