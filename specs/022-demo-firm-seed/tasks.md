---
description: "Task list for 022-demo-firm-seed"
---

# Tasks: The Demo Firm Seed

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: mandatory, strict TDD — every test task is run and **seen to fail** before the task
under it starts. The generators and the guard are pure functions, so most of this suite runs in
`test:unit` with no database, which is what makes the slice testable on a machine where Docker
cannot pull MinIO.

## Format: `[ID] [P?] [Story] Description`

Stories: **US1** sign in on a fresh stack · **US2** a firm worth looking at · **US3** documents
that open · **US4** the guard.

---

## Phase 1: The guard (US4) — FIRST, because every later task runs the command

- [x] T001 [US4] Unit test `backend/tests/unit/demo-guard.test.ts`: `assertLocalDemoTarget`
      refuses `NODE_ENV=production` and `NODE_ENV=staging`; refuses a `DATABASE_URL_MIGRATION`
      host of `db.prod.internal`, `10.0.0.5` and `rds.amazonaws.com`; permits `localhost`,
      `127.0.0.1`, `::1`, `host.docker.internal`, `postgres`; refuses a missing/unparseable URL;
      and the refusal message contains **no** connection string. Assert also that no exported
      symbol accepts a `force`/`allow` argument. **See it fail.**
- [x] T002 [US4] `backend/drizzle/demo/guard.ts` — `DemoSeedRefused` and
      `assertLocalDemoTarget(env)`, reusing `isDeployedEnvironment` from
      `common/auth/deployment-assertions.ts` rather than re-implementing the deny-list.

## Phase 2: Shared plumbing (blocks Phases 3–6)

- [x] T003 [P] Unit test `backend/tests/unit/demo-rng.test.ts`: `mulberry32(SEED)` yields the same
      first twenty values on two instances; `pick`/`shuffle` are stable; no file under
      `drizzle/demo/` calls `Math.random` (assert by reading the directory). **See it fail.**
- [x] T004 [P] `backend/drizzle/demo/rng.ts` — `mulberry32`, `pick`, `shuffle`, `intBetween`, one
      exported `DEMO_SEED`.
- [x] T005 [P] Unit test `backend/tests/unit/demo-deterministic-id.test.ts`: `deterministicUuid`
      is stable across calls, differs per input, and matches the UUID shape `buildObjectKey`
      requires (so `buildObjectKey` accepts it). **See it fail.**
- [x] T006 [P] `backend/drizzle/demo/deterministic-id.ts` — SHA-256 → RFC-4122-shaped UUID.
- [x] T007 `backend/drizzle/load-env.ts` — the single `loadEnvFile` (FR-015); delete the copies in
      `drizzle/migrate.ts` and `drizzle/seed.ts` and import it in both. Behaviour identical:
      absent file is a no-op, `#` comments skipped, existing `process.env` keys never overwritten.
- [x] T007a **Principle VI — keep the fixture credentials out of the shipped artifact.** Unit test
      `backend/tests/unit/demo-not-in-build.test.ts`: `tsconfig.build.json`'s `exclude` contains
      `drizzle/demo/**` and `drizzle/seed-demo.ts`; no file under `src/**` imports anything from
      `drizzle/demo/`; and `DEMO_PASSWORD` appears in no file under `src/`. **See it fail**, then
      add the two exclude entries. (Found by `/speckit-analyze` as CRITICAL: the build excludes
      `drizzle/seed.ts` but not `src/**`, so demo material under `src/` would be compiled into
      `dist/` and ship inside the deployed image, where the runtime guard cannot reach it.)
- [x] T008 `backend/src/common/storage/object-store/object-store.config.ts` —
      `objectStoreConfigFromEnv()` moved out of `documents.module.ts:22-39` verbatim;
      `DocumentsModule` imports it. No behaviour change, so the existing document contract tests
      are the regression check.

## Phase 3: The firm and its people (US1) 🎯 MVP

- [x] T009 Unit test `backend/tests/unit/demo-firm-data.test.ts`: exactly seven people; their
      archetypes are `MP, AA, AA, PL, CM, BM, SA`; every person has a position that the firm's
      catalog (default ∪ demo-owned) contains; emails are unique, lowercase and on
      `@demo.legalconnect.mx`; Laura Ramírez holds a second membership in the second firm with a
      different archetype; both firms' RFCs match `tenant`'s shape constraint. **See it fail.**
- [x] T009a **FR-019 — the demo firm is Spanish.** Extend `demo-firm-data.test.ts` (or a sibling
      `demo-spanish-copy.test.ts`) to collect **every** demo-visible string — firm names, people,
      positions, categories, client names, matter titles, event titles — and assert none matches an
      English-tells pattern, reusing the shape of `frontend/tests/component/spanish-copy.test.tsx`
      (`/\b(the|and|is|are|to|for|of|case|file|status|client|document)\b/i`), with an explicit
      allow-list for `S.A. de C.V.`, `S.C.`, `S. de R.L.` and `EXP`. **See it fail.**
      (Gap found by `/speckit-analyze`: FR-019 had no task, and the frontend's Spanish check
      renders components — it never sees seed data.)
- [x] T010 `backend/drizzle/demo/firm.ts` — the two firms, the seven people, the three demo-owned
      positions and six demo-owned categories, `DEMO_PASSWORD`, and the phrase-derived
      `totpSecretFor(slug)` / `backupCodesFor(slug)` (Decision 2).
- [x] T011 Unit test — landed in `backend/tests/unit/demo-firm-data.test.ts` rather than a separate `demo-totp-usable.test.ts`, since it asserts a property of the same module: a code generated by
      `generateAt(totpSecretFor('mendez'), now)` verifies through the product's own `verifyCode`;
      the derived secret is valid base32; two people's secrets differ. This is the test that
      proves the *printed* secret is usable rather than assumed. **See it fail.**
- [x] T012 Integration test — landed in `backend/tests/integration/demo-seed.test.ts` (one file that runs the real command once, rather than several that each re-run it): after the
      command, every demo identity has an `identity_credential` whose digest verifies against
      `DEMO_PASSWORD` through `verifyCredential`; an `identity_factor` with `confirmed_at` set and
      a `key_reference` the configured provider can `unwrap`; exactly ten `backup_code` rows
      sharing one `set_id`; and `identity.mfa_enrolled_at` is non-null **iff**
      `identity_factor.confirmed_at` is (FR-004). **See it fail.**
- [x] T013 `backend/drizzle/seed-demo.ts` — entry point: guard, env, connections, then firms →
      plans → people → auth rows → positions → directory entries, all idempotent. Prints the
      credential table.
- [x] T014 Contract test `backend/tests/contract/demo-sign-in.test.ts`: for **each of the seven**
      demo people (SC-002 says all seven, not one), `POST /auth/sign-in` with their email and
      `DEMO_PASSWORD` issues a challenge; `POST /auth/factor` with a code from their derived secret
      returns a session; a **wrong** code is refused; and no request succeeds without the second
      factor (FR-013). The test seeds by calling the demo module's own writers against the test
      database — it does **not** shell out to `npm run db:seed:demo`, so a booted-app test never
      depends on a CLI side effect. **See it fail.**
- [x] T014a **FR-020 — the printed output.** Unit test
      `backend/tests/unit/demo-output-safety.test.ts`: the credential table the command renders is
      produced by a pure `renderCredentialTable(people)` function, and its output contains each
      email, the shared password and each TOTP secret, and contains **no** `$argon2id$` digest, no
      wrapped-secret bytes, no `postgres://`/`postgresql://` substring and no `key_reference`.
      **See it fail**, then extract the renderer from `seed-demo.ts` so it is testable.
      (Gap found by `/speckit-analyze`: T001 checked the refusal message only, while the
      success-path table is the output that actually prints beside a digest.)

## Phase 4: Clients and matters (US2)

- [x] T015 [P] Unit test `backend/tests/unit/demo-clients.test.ts`: 25 names for firm 1 and 4 for
      firm 2, all distinct case-insensitively (which is what makes the `legal_name` idempotency
      lookup safe); the `organization`/`person` split; every generated RFC matches
      `^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$`; organisations get 3-letter and people 4-letter
      prefixes; no name matches a list of real Mexican companies (FR-005). **See it fail.**
- [x] T016 [P] `backend/drizzle/demo/clients.ts`.
- [x] T017 Unit test `backend/tests/unit/demo-matters.test.ts`: 40 matters for firm 1; file
      numbers unique and of the form `EXP-<yyyy>-<nnnn>`; `opened_on` spans six quarters ending
      in the current one; every matter whose status is the closing status has `closed_on` set,
      strictly after `opened_on`, and no other matter does (FR-006); all six matter types appear;
      the two `AA` lead counts differ by at least three; at least three matters have no assignment
      for either `AA` (FR-007). **See it fail.**
- [x] T018 `backend/drizzle/demo/matters.ts`.
- [x] T019 Integration test — in `demo-seed.test.ts`'s "matters" block: after the
      command, `case_file` rows carry a `matter_type_id`, a `case_status_id` from the firm's own
      catalog, and `closed_on` exactly where the status `is_closing`; `case_assignment` has one
      live `lead` per assigned matter and no duplicate live pair. **See it fail.**
- [x] T020 Wire clients and matters into `seed-demo.ts`.

## Phase 5: Documents with real bytes (US3)

- [x] T021 [P] Unit test `backend/tests/unit/demo-file-bytes.test.ts`: `minimalPdf(seedText)`
      starts with `%PDF-` and ends with `%%EOF`; `minimalPng()` carries the 8-byte PNG signature
      and an `IEND` chunk; both are under 4 KB; both are deterministic. **See it fail.**
- [x] T022 [P] `backend/drizzle/demo/documents.ts` — generation plus the two byte builders.
- [x] T023 Unit test `backend/tests/unit/demo-documents.test.ts`: ~130 documents, unevenly
      distributed (no matter holds more than a quarter of them, at least five hold none); at least
      one `withdrawn`; every MIME type is in `007`'s `ALLOWED_MIME_TYPES`; every storage key equals
      `buildObjectKey(tenant, case, deterministicId)`; `size_bytes` equals the generated buffer's
      length. **See it fail.**
- [x] T024 Integration test — in `demo-seed.test.ts`'s "documents and the storage counter" block: after
      the command, `tenant.storage_bytes_used` equals `SUM(size_bytes)` over **all** that tenant's
      document rows, withdrawn included (FR-010); and a second run leaves it unchanged.
      **See it fail.**
- [ ] T025 **NOT DONE — needs MinIO, which cannot be pulled on this machine.** Deliberately not written rather than written-and-skipped, so no suite implies coverage that is absent. Integration test `backend/tests/integration/demo-seed-objects.test.ts` *(needs MinIO)*:
      every seeded document's key resolves to an object whose byte length equals `size_bytes`;
      a second run writes no new object. **See it fail.** If MinIO is unavailable, this test is
      **skipped explicitly, never deleted**, and the skip is recorded in `quickstart-results.md`.
- [x] T026 Wire documents into `seed-demo.ts`, including the FR-016 degraded path: rows always
      written, unreachable-store reported per document, exit code non-zero.
- [ ] T027 **NOT DONE as a separate file.** FR-016 was verified by running the command in exactly that state and is asserted in `demo-seed.test.ts`'s "FR-016" block, which covers both the reachable and unreachable cases. A dedicated closed-port test would duplicate it; recorded in quickstart-results.md: with
      `OBJECT_STORE_ENDPOINT` pointed at a closed port, every row is still written, each missing
      object is named on stderr, and the exit status is non-zero (FR-016). **See it fail.**

## Phase 6: Calendar (US2)

- [x] T028 [P] Unit test `backend/tests/unit/demo-calendar.test.ts`: ~18 events; more than one
      `type`; both past and future relative to a fixed clock; some `case_id` null and some set;
      every event satisfies `calendar_event_one_shape` (all-day ⇒ dates only, timed ⇒ instants
      only) and `remind_minutes_before` ∈ {15, 60, 1440, 2880, 10080} or null. **See it fail.**
- [x] T029 [P] `backend/drizzle/demo/calendar.ts`, wired into `seed-demo.ts`.

## Phase 7: Idempotency, determinism and the script entry

- [x] T030 Integration test — in `demo-seed.test.ts`'s "idempotency" block: run the
      command twice; assert per-table row counts and a content checksum are identical after the
      second run, and that the printed credentials match (FR-014, SC-003). **See it fail.**
- [x] T031 `package.json` — `"db:seed:demo": "tsx drizzle/seed-demo.ts"`. Also confirm
      `npm run check:env` still passes (no new environment variable is introduced).
- [x] T032 Unit test `backend/tests/unit/demo-no-mfa-bypass.test.ts`: reading every file under
      `drizzle/demo/` plus `drizzle/seed-demo.ts` and `package.json` as text, assert none writes a
      column that would relax a factor (`failed_attempt_count` set above 0, `locked_until`,
      `confirmed_at` left null while `mfa_enrolled_at` is set) and none mentions an identifier
      matching `/(SKIP|BYPASS|DISABLE)[_A-Z]*MFA|MFA[_A-Z]*(SKIP|BYPASS|DISABLE)/i`
      (FR-013, SC-006). Scoped to files, not to a diff — a test cannot read a diff. **See it fail.**

## Phase 8: Gates and closure

- [x] T032a **SC-009 — secret scanning.** Read the repository's `gitleaks` configuration
      (`.github/workflows/`, plus any `.gitleaks.toml`) and check this slice's committed strings
      against its rules. If `gitleaks` cannot be executed on this machine, do **not** claim
      SC-009: record in `quickstart-results.md` that the check was reasoned about but not run, and
      name the CI job that will run it. (Gap found by `/speckit-analyze`.)
- [x] T033 Backend gates (coverage run NOT completed — see quickstart-results.md): `npm run typecheck`, `npm run lint`, `npm test`, and with a database:
      `test:rls`, `test:isolation`, `verify:role`, `test:auth-coverage`, `npm test -- --coverage`.
      **`test:isolation` must pass on a database where the demo seed has also run** — the
      realistic developer state, and Decision 1's actual claim.
- [x] T034 Frontend gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. This
      slice changes no frontend file, so these are a regression check, not a verification.
- [x] T035 `specs/022-demo-firm-seed/quickstart.md` — the setup walkthrough, the full credential
      table (emails, shared password, per-person TOTP secret and backup codes) and the guard's
      two refusals, written by hand (FR-018).
- [x] T036 `specs/022-demo-firm-seed/quickstart-results.md` — what was verified and what was not,
      naming every suite that did not run and why. Never claim a suite that did not run.
- [x] T037 Re-read the spec's Approval Checklist; leave the nine Decision boxes **unticked**
      (pending Jero) and confirm the verification boxes are honest.

---

## Dependencies

- T001–T002 first: everything after runs the command, and running it before the guard exists is
  the one mistake this slice must not make even once on a developer's machine.
- T007–T008 block Phases 3–6 (env loading and the object-store config they all use).
- T009–T014 (people) block T019/T024 — matters need memberships, documents need memberships.
- T021–T022 block T023–T027.
- T030 requires every writer to exist.
- Phase 8 last.

## Parallel opportunities

`[P]` tasks touch disjoint files: T003/T004 (rng) ‖ T005/T006 (ids); T015/T016 (clients) ‖
T021/T022 (bytes) ‖ T028/T029 (calendar). Everything that writes to `seed-demo.ts` is serial by
construction, which is deliberate: one orchestration file, read top to bottom.
