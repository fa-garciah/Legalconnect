# Implementation Plan: The Demo Firm Seed

**Branch**: `022-demo-firm-seed` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

## Summary

One new command, `npm run db:seed:demo`, that writes two fictional firms whose people can actually
sign in — real Argon2id credentials, real confirmed TOTP factors, real backup codes — plus enough
clients, matters, documents and events for `015` and `023` to be judged against. It refuses to run
outside a local database on two independent, unoverridable checks. `drizzle/seed.ts` is not
changed in behaviour; the isolation suite keeps the fixture set it reads (spec Decision 1).

No migration. No new table, endpoint, capability or audit action. No new dependency.

## Technical Context

| | |
|---|---|
| Runtime | Node 22, TypeScript, executed by `tsx` (the runner `db:migrate` and `db:seed` already use) |
| Database | PostgreSQL 16; the **migration** connection (`DATABASE_URL_MIGRATION`), per `seed.ts:121-126` |
| Auth primitives | `common/auth/argon2.ts` (`hashCredential`, `hashHighEntropy`), `common/auth/totp.ts` (`generateAt`), `common/auth/key-provider.ts` (`resolveKeyProvider`). `modules/auth/backup-codes.ts` supplies the **`XXXXX-XXXXX-…` format and its alphabet only**; its `generateBackupCodeSet()` is deliberately **not** called, because FR-014 requires a re-run to print the same codes |
| Storage | `ObjectStorePort.put` via `S3ObjectStore`, pointed at MinIO by `OBJECT_STORE_*` |
| Testing | Vitest. Unit tests for the generators and the guard (no database); integration tests for the writes (local Postgres); the object-store assertions need MinIO |
| New dependencies | **None** — `backend/tests/integration/no-new-dependency.test.ts` holds an exact baseline of the manifest and stays green unedited |

## Constitution Check

| Principle | How this slice meets it |
|---|---|
| I — spec → plan → tasks, story IDs | This document; story `US22-EP00-FND-SeedDemoFirm`, added to the catalog in this PR |
| II — tenant isolation | No new table, no policy, no application-side `tenant_id` filter. Writes run on the migration connection — fixture setup, the standing `seedIdentitiesAndMemberships` already holds (`seed.ts:121-126`). The second sparse firm exists so isolation is *visible* on screen, not merely asserted |
| III — firm-agnostic core | Nothing firm-specific enters product code. Every demo-only catalog row is inserted into *that tenant's own* `position` / `document_category` catalog (Decision 6). The command lives in `drizzle/`, never in `src/modules/` |
| IV — deny by default | No capability added, no matrix row changed, no endpoint exposed. `matrix-exhaustive.test.ts` is untouched **and must stay untouched** — if this slice's diff contains it, something is wrong |
| V — audit | No audit entry written and none needed: fixture setup is not a user journey. Crucially this means **no migration** — the audit vocabulary is a `CHECK` constraint re-issued whole per slice (`0046_calendar_event.sql:82-157`), and this slice adds nothing to it |
| VI — compliance | Decision 2 argues the fixture credentials, and Decision 3's guard is what makes the argument hold. FR-020 bars digests, wrapped secrets and connection strings from output. The demo people are invented; no real person's data is seeded |
| MFA (v1.5.0) | FR-013: no bypass, no skip, no relaxed factor. The demo person authenticates through the same `sign-in` → `factor` ceremony as anybody else; that is precisely why the TOTP secret must be printed |
| TDD | Every task below is test-first. The guard and the generators are pure functions, so their tests need no database and run in `test:unit` |

## Structure

```text
backend/
├── tsconfig.build.json                # + exclude drizzle/demo/** and drizzle/seed-demo.ts
├── drizzle/
│   ├── load-env.ts                    # NEW — the one copy (FR-015); migrate.ts + seed.ts import it
│   ├── seed.ts                        # unchanged behaviour; its loadEnvFile copy deleted
│   ├── migrate.ts                     # unchanged behaviour; its loadEnvFile copy deleted
│   ├── seed-demo.ts                   # NEW — the command's entry point, orchestration only
│   └── demo/                          # NEW — the demo firm's data and generators
│       ├── guard.ts                   # assertLocalDemoTarget(): the two checks, no override
│       ├── firm.ts                    # the two firms, the seven people, positions, categories
│       ├── clients.ts                 # the 25 client names + deterministic RFCs
│       ├── matters.ts                 # matter generation: numbers, dates, statuses, assignments
│       ├── documents.ts               # document generation + the PDF/PNG byte builders
│       ├── calendar.ts                # event generation
│       ├── rng.ts                     # mulberry32, one fixed seed (FR-017)
│       └── deterministic-id.ts        # stable UUIDs for documents (FR-014, Decision 5)
├── src/common/storage/object-store/
│   └── object-store.config.ts         # NEW — objectStoreConfigFromEnv(), moved out of DocumentsModule
└── src/modules/documents/documents.module.ts  # imports the moved config instead of declaring it
```

**Why `drizzle/demo/` and not `src/demo/` — a Principle VI requirement, not a preference.**
The first draft of this plan put the generators under `src/`. `/speckit-analyze` caught it as
CRITICAL and it is worth recording why, because the mistake is easy and invisible:
`tsconfig.build.json` excludes `tests`, `*.test.ts` and `drizzle/seed.ts` — and **not** `src/**`.
Demo material under `src/` would therefore be compiled into `dist/` and ship inside the deployed
image: `DEMO_PASSWORD`, every TOTP phrase, every backup-code phrase, sitting in a production
artifact. Decision 3's guard is a *runtime* check on where the command may write; it cannot
un-ship material that is already in the image. The existing `drizzle/seed.ts` exclusion is the
precedent, and this slice extends it to `drizzle/demo/**` and `drizzle/seed-demo.ts`.
Coverage reporting agrees: `vitest.config.ts`'s `coverage.include` is `src/**/*.ts`, so fixture
generators under `src/` would also dilute the coverage figure the constitution makes blocking.

`tsconfig.json`'s `include` already covers `drizzle/**/*`, so the generators are still
type-checked by `npm run typecheck` and still importable from `tests/unit/` — which is what keeps
FR-017's determinism and FR-005's RFC shapes assertable without Postgres, on a machine where
Docker cannot pull an image. `seed-demo.ts` stays thin: it opens connections, calls generators,
writes rows.

**Why the object-store config moves**: `objectStoreConfig()` is module-private inside
`documents.module.ts:22-39`. The seed needs the same four values, and a second copy is exactly the
drift `position-catalog.seed.ts` and `case-catalog.seed.ts` both record having been bitten by. One
exported `objectStoreConfigFromEnv()` beside the port, two callers.

## The two guard checks (Decision 3)

```text
assertLocalDemoTarget(env) →
  1. isDeployedEnvironment(env)                    # reused verbatim from common/auth/deployment-assertions.ts
       → throw DemoSeedRefused('NODE_ENV=<x>')     #   NODE_ENV ∈ {production, staging}: a DENY-list
  2. host of env.DATABASE_URL_MIGRATION ∉
       {localhost, 127.0.0.1, ::1, [::1],
        host.docker.internal, postgres}            #   an ALLOW-list
       → throw DemoSeedRefused('host <h>')
```

Deny-list for environments, allow-list for hosts — each inverted so an unknown value inherits
refusal, the reasoning `deployment-assertions.ts:26-32` sets out. Thrown **before any connection
is opened**, so a refusal cannot have written anything. The message names the offending value and
never the connection string (FR-020). There is no parameter, flag or variable that skips either
check, and the error class carries no `force` path — a reviewer should be able to confirm that by
reading eleven lines.

## The auth writes, mirroring enrollment exactly

`enrollment.service.ts:174-197` is the reference order, and the demo seed performs the same four
writes per person in one transaction:

1. `identity_credential` ← `hashCredential(DEMO_PASSWORD)`
2. `identity_factor` ← `resolveKeyProvider().wrap(secret)` → `{ciphertext, keyReference}`, with
   `confirmed_at = now()`
3. `identity.mfa_enrolled_at = now()` — written **with** step 2, never apart (FR-004)
4. ten `backup_code` rows sharing one `set_id`, digests from `hashHighEntropy`

The TOTP secret is `base32(utf8("demo-totp-<slug>"))` (Decision 2): what the repository commits is
a readable phrase, what the authenticator receives is ordinary base32. A unit test asserts that a
code generated from the derived secret verifies through the product's own `verifyCode`, so the
printed secret is proven usable rather than assumed.

Backup codes are **derived** the same way (`demo-backup-<slug>-<n>`, formatted into the
`XXXXX-XXXXX-…` shape) rather than taken from `generateBackupCodeSet()`, because FR-014 requires a
re-run to print the same codes and FR-018 requires them documented. They are digested with the same
`hashHighEntropy` profile, so `recovery.service.ts` consumes them unmodified.

## Data shape

| What | Count | How |
|---|---|---|
| Firms | 2 | *Despacho Méndez & Asociados, S.C.* (`profesional`), *Bufete Ríos y Caballero, S.C.* (`esencial`) |
| People | 7 identities, 8 memberships | MP, AA×2, PL, CM, BM, SA in firm 1; Laura Ramírez also MP in firm 2 |
| Positions | 5 default + 3 demo-owned | Decision 6 |
| Document categories | 4 default + 6 demo-owned | Decision 6 |
| Clients | 25 in firm 1, 4 in firm 2 | 18 `organization` + 7 `person`; RFCs generated to `^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$` and unit-asserted |
| Matters | 40 in firm 1, 5 in firm 2 | `EXP-<year>-<nnnn>`; `opened_on` spread over six quarters; `Concluido` ⇒ `closed_on` set, others ⇒ null |
| Assignments | uneven by construction | Laura ≫ Jorge; ≥3 matters with neither (FR-007) |
| Documents | ~130 in firm 1 | 60 % PDF, 40 % PNG; ≥1 withdrawn; `storage_bytes_used` recomputed as the sum over **all** rows (FR-010) |
| Calendar events | ~18 | `hearing`/`deadline`/`meeting`, past and future, some case-linked; one-shape constraint respected |

Idempotency per table: `case_file` on its unique `(tenant, lower(trim(file_number)))`; `client` by
an explicit `(tenant, legal_name)` lookup, the guard `seed.ts:305-309` already uses, safe here
because a unit test asserts the 29 names are distinct; `document` on its unique `storage_key`,
which is stable because the document id is derived (Decision 5); `identity` on `subject`;
`membership` on `(identity_id, tenant_id)`; `tenant` on `rfc`.

## Risks

- **MinIO is unreachable on this machine.** `quay.io` returns `401` for the pinned
  `minio/minio` and `minio/mc` tags, verified by direct `docker pull` on 2026-09-25 (Docker Hub
  pulls work, so it is not a proxy). FR-016's degraded path is therefore the one that will be
  exercised here, and `quickstart-results.md` will say exactly which document assertions did not
  run. This is a reporting obligation, not a reason to weaken FR-009.
- **`gitleaks`** is blocking in CI and a base32 blob looks like a secret. Decision 2's
  phrase-derivation is the mitigation; the committed strings are `demo-totp-mendez` and the shared
  password, both plainly fixtures. Commit 903fe34 shows this repository has already had one
  gitleaks false positive on a test placeholder, so this is a known, live risk rather than a
  hypothetical one.
- **Argon2id cost.** `INTERACTIVE_PROFILE` is 19 MiB / t=2 per hash. Seven credentials and 70
  backup codes is 77 hashes; at ~60 ms each that is under 5 seconds, and backup codes use the
  cheaper `HIGH_ENTROPY_PROFILE`. Acceptable for a command run by hand; the numbers are recorded
  so nobody later "optimises" it by weakening a profile.
- **`no-context.test.ts` must not see this data.** It reads `db:seed`'s fixtures. Decision 1 keeps
  the commands separate, and a task asserts `test:isolation` passes unedited on a database where
  the demo seed has *also* run — the realistic developer state.
- **Touching `migrate.ts` and `seed.ts` at all** (FR-015) puts two working scripts in the diff.
  The change is import-only, and both are covered by running them end to end in the gates.
