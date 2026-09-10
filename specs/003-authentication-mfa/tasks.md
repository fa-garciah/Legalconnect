---

description: "Task list for 003-authentication-mfa"
---

# Tasks: Authentication & Multi-Factor Enrollment

**Input**: Design documents from `/specs/003-authentication-mfa/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Included and mandatory.** Constitution v1.5.0 makes strict TDD non-negotiable, and this slice carries three coverage paths the constitution names individually and blockingly (SC-029). Every test task must be written, run, and **seen to fail** before the implementation task(s) under it begin.

**Organization**: Grouped by user story. Story numbers follow `spec.md`'s numbering, not the catalog IDs — mapping: US1 = `US06-EP12-ASC-AuthenticateWithMFA`, US2 = `US02-EP12-ASC-EnrollMFAFactor`, US3 = `US03-EP12-ASC-ReceiveBackupCodes`, US4 = `US13-EP12-ASC-RecoverWithBackupCode`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Exact file paths are included in every task

## Path Conventions

Web application, **both halves** this time — unlike `002`, this slice ships
`backend/` and `frontend/` together, because the four screens are the only way to
exercise the flows and because replacing `principal.ts` is half the slice's purpose
(plan.md, Structure Decision). This slice modifies files owned by `001`, `002` and
`016a` — each such task says so explicitly.

## TDD exemptions in force

Constitution exemption 1 covers declarative migrations, so tasks touching
`backend/drizzle/*.sql` carry no preceding test of their own. They are verified by
the lockdown tasks at the end of Phase 2 (T036–T041) and by every story-phase test
that exercises the schema. Exemption 4 covers Tailwind classes and Spanish copy
strings, per `016a`'s D6 reading.

---

## Blocking design question — RESOLVED 2026-09-09

**The design documents contradict each other on how `lc_auth` is reached, and the
contradiction is not cosmetic: it decides the content of five migrations, whether a
fifth connection string exists, and whether D3's guarantee is a data-layer one.**

[data-model.md](./data-model.md#roles) declares `lc_auth` **`NOLOGIN`** and says its
functions "return a verdict and never the material."
[contracts/authentication.md](./contracts/authentication.md) says the authentication
routes "run under `lc_auth`'s **connection** for verification." Both cannot hold, and
the `NOLOGIN` reading cannot be implemented at all, for three independent reasons:

1. **`verify_credential(email, digest_candidate)` cannot work as specified.** Argon2id
   digests are salted. Deriving a comparable digest requires the stored PHC string's
   salt, so the application cannot produce a `digest_candidate` without first reading
   the stored digest.
2. **`verify_factor(identity_id, code)` cannot work either.** The TOTP secret is
   envelope-encrypted under an application-held key ([D5](./research.md#d5--totp-secrets-use-envelope-encryption-behind-a-keyprovider-port-kms-in-production-and-a-local-key-in-devci)).
   PostgreSQL does not hold that key — deliberately, per FR-013 — so no in-database
   function can decrypt the secret to verify a code against it.
3. **`@node-rs/argon2` does not exist inside PostgreSQL.** [D6](./research.md#d6--argon2id-via-node-rsargon2-for-both-credentials-and-backup-codes-with-two-parameter-profiles)
   puts Argon2id in the application, and [D4](./research.md#d4--credential-establishment-extends-accept_invitation-it-does-not-add-a-second-path)
   rejects `pgcrypto` explicitly. RDS admits no PL/Rust extension that would change this.

**Resolution — accepted by the author 2026-09-09. Phase 2 is unblocked.**

`lc_auth` is **`LOGIN`**, with its own connection string (`DATABASE_URL_AUTH`), used
by `backend/src/modules/auth/` and by nothing else. It holds the table grants. `lc_app`
holds **no grant on any of the five tables and no `EXECUTE` on any verification
function** — its connection genuinely cannot reach authentication material, which is
D3's actual goal and is stronger than the `NOLOGIN` reading achieves. `SECURITY
DEFINER` functions are retained only where atomicity or race control needs them
(`claim_attempt`, `consume_backup_code`, `rotate_refresh`, `resolve_session`), not as a
secrecy mechanism they cannot provide.

`resolve_session()` is the one exception and stays `EXECUTE`-granted to `lc_app`: every
request must resolve a session, that resolution happens before `app.identity_id` exists
([D8](./research.md#d8--session-resolution-refresh-rotation-and-family-revocation-are-each-one-security-definer-function)),
and a session digest is not material FR-013/FR-015 protect.

**This changes no requirement and no success criterion.** SC-006 ("0 factor secrets are
readable through any capability by any archetype") is satisfied more directly: no
archetype's connection holds a grant, and the only connection that does is confined to
`backend/src/modules/auth/`.

- [X] T000 **Accepted, and the design documents corrected to match.**
  [data-model.md](./data-model.md#roles) — `lc_auth` is `LOGIN`, the `lc_app` row of all
  four grants tables reads **none**, and the functions section is rewritten around
  atomicity rather than secrecy, with `verify_credential()` removed as a wrapper around a
  plain read. [research.md D3](./research.md#d3--authentication-material-lives-in-tables-lc_app-cannot-reach-verified-inside-security-definer-functions)
  carries a dated amendment narrowing its second clause and keeping its rationale, which
  argued for separate ungranted tables and is unaffected. [plan.md](./plan.md) — Summary
  bullet, Complexity Tracking row and Status updated. **`spec.md` is untouched: no
  requirement and no success criterion changed**, which is the test of whether this was a
  plan-level decision or a spec-level one.

**Also carried from plan.md, not resolvable here:** constitution v1.5.0 is still
uncommitted to `main` (`main` at `0901b08` carries v1.4.1). Does not block these
tasks; blocks merge.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The three backend dependencies the constitution names or implies, the one
frontend dependency, and the configuration surface. No new test runner configuration —
this slice reuses `001`'s and `016a`'s toolchains entirely.

- [x] T001 Create the new directories per plan.md: `backend/src/common/auth/`, `backend/src/modules/auth/`, `backend/tests/integration/concurrency/`, `frontend/src/app/(auth)/`, `frontend/tests/component/auth/`
- [x] T002 Add the three backend runtime dependencies, **pinned exactly** because the constitution places `otplib` and the credential verifier inside Principle II's blast radius — `otplib`, `@node-rs/argon2`, `@aws-sdk/client-kms` — in `backend/package.json` (plan.md, Primary Dependencies)
- [x] T003 [P] Add `next-auth` to `frontend/package.json`, confined to [D1](./research.md#d1--nextauth-is-the-browsers-session-transport-the-apis-session-table-is-the-sole-authority)'s transport role. `input-otp@^1.5.0` and `frontend/src/components/ui/input-otp.tsx` are **already present** from `016a`'s shadcn set — the challenge screen needs no new UI package
- [x] T004 Update `BASELINE_DEPENDENCIES` with the three additions from T002 in `backend/tests/integration/no-new-dependency.test.ts`, following the precedent that test's own comment sets for `007` — **this test fails the moment T002 lands and must be updated, not deleted** (depends on T002)
- [x] T005 [P] Add the Slice 003 block to `backend/.env.example`: `DATABASE_URL_AUTH` (T000), `AUTH_KEY_PROVIDER`, `AUTH_LOCAL_KEY`, `AUTH_KMS_KEY_ID`, `AUTH_LOCKOUT_THRESHOLD=5`, `AUTH_LOCKOUT_MINUTES=15`, `AUTH_BACKUP_CODE_COUNT=10` — each commented as a **parameter, not a switch** (quickstart.md, Required environment). `npm run check:env` verifies this file
- [x] T006 [P] Create `frontend/.env.example` (it does not exist) with `NEXTAUTH_URL`, `NEXTAUTH_SECRET` and `NEXT_PUBLIC_API_BASE_URL`
- [x] T007 [P] Extend the `Role` union and `ENV_BY_ROLE` map with `'auth'` → `DATABASE_URL_AUTH` in `backend/tests/helpers/db.ts`, so lockdown tests can connect as the real role rather than as the owner (MODIFIES a slice 001 file)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Five tables, one new role, five functions, one replaced function, the
cryptographic primitives, and the session mechanism every user story stands on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. T008
through T014 in particular gate everything — **a grant that is even slightly too wide
reopens exactly the disclosure FR-015 exists to close, with every test still passing
if the wrong invariant is tested.** T036–T041 are what prove the grants are right, and
they are the hard gate.

### Schema, grants and the functions (TDD exemption 1)

- [x] T008 Create the `lc_auth` role per T000's resolution — `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`, `GRANT USAGE ON SCHEMA public`, `REVOKE CREATE ON SCHEMA public` — plus its `audit_event` `INSERT` grant and a policy admitting `tenant_id IS NULL` rows restricted to the twelve new actions, **and narrow `lc_app`'s existing `audit_event_own_tenant` `WITH CHECK` to exclude those twelve**, in `backend/drizzle/0030_lc_auth_role.sql` — data-model.md Roles + Audit vocabulary, [D12](./research.md#d12--twelve-audit-actions-written-in-transaction-attributed-to-no-tenant-where-none-exists). Follows `0000_roles.sql` and `0018_lc_app_audit_action_restriction.sql`'s shape exactly (T000's resolution supplies the role's shape)
- [x] T009 Create `identity_credential` — `identity_id` PK/FK, `digest`, `updated_at` — with **zero grants to `lc_app`**, `INSERT` for `lc_identity_writer`, and `SELECT` + column-scoped `UPDATE` for `lc_auth`, in `backend/drizzle/0031_identity_credential.sql` — data-model.md `identity_credential`
- [x] T010 Create `identity_factor` — `secret_ciphertext bytea`, `key_reference`, `confirmed_at`, `failed_attempt_count`, `locked_until` — with **zero grants to `lc_app`**, plus the `claim_attempt(identity_id, code_digest, succeeded)` `SECURITY DEFINER` function applying FR-020's replay guard **across the whole 90-second window**, FR-021's counter and the 15-minute lockout in one indivisible step. It receives a digest of the *presented code* — the application has already verified the code against the decrypted secret, because the envelope key is not in the database. Serves FR-005's credential-step threshold too, in `backend/drizzle/0032_identity_factor.sql` — data-model.md `identity_factor`, [D7](./research.md#d7--lockout-is-counters-on-identity_factor-the-authentication-attempt-entity-is-counters-plus-the-existing-audit-log)
- [x] T011 Create `backup_code` — `set_id` grouping an issued set, `digest`, `consumed_at`, plus the partial index on `(identity_id, set_id) WHERE consumed_at IS NULL` — with **zero grants to `lc_app`**, plus `consume_backup_code(identity_id, code_id)` marking one row consumed under `SELECT … FOR UPDATE` so two recoveries presenting the same last code yield exactly one success. **The fixed-comparison-count loop lives in the application** (T028), which is where Argon2id is, in `backend/drizzle/0033_backup_code.sql` — data-model.md `backup_code`, [D11](./research.md#d11--backup-code-verification-tries-every-unconsumed-code-with-no-early-exit-timing-signal)
- [x] T012 Create `session` and `refresh_token` with their `family_id`/`parent_id`/`used_at` columns, `lc_retention` `DELETE` for pruning, plus `resolve_session()` (**the one function `lc_app` may `EXECUTE`**) and `rotate_refresh()` revoking the entire family on detected reuse under `SELECT … FOR UPDATE` on the family, in `backend/drizzle/0034_session_and_refresh.sql` — data-model.md `session`/`refresh_token`, [D8](./research.md#d8--session-resolution-refresh-rotation-and-family-revocation-are-each-one-security-definer-function)
- [x] T013 Add the unique index on `lower(btrim(email))` to `identity` in `backend/drizzle/0035_identity_email_unique.sql`, **preceded in the same file by a guard that fails loudly on pre-existing duplicates** rather than letting the index error be the first signal — [D9](./research.md#d9--identityemail-gains-a-unique-index-on-a-normalized-form-and-subject-becomes-a-product-generated-opaque-value), plan.md non-blocking item 2. Normalization is `lower(btrim(...))` and nothing cleverer
- [x] T014 `DROP FUNCTION accept_invitation(text, text, text, int)` and create the five-argument version taking the Argon2id digest and inserting the `identity_credential` row inside the existing transaction, in `backend/drizzle/0036_accept_invitation_v2.sql` — **preserving unchanged** the `FOR UPDATE` on the invitation row that makes `002/SC-005` hold, the six collapsed refusal branches, the tenant-status check, the audit writes and atomicity; `OWNER TO lc_identity_writer` — [D4](./research.md#d4--credential-establishment-extends-accept_invitation-it-does-not-add-a-second-path), data-model.md Replaced function
- [x] T015 Run the pre-flight duplicate query from T013 against **every** environment and record the result, before `0035` is allowed to run anywhere — plan.md non-blocking item 2. A non-empty result needs a remediation decision, not a migration retry

### Application-side registries

- [x] T016 Extend the Drizzle schema with the five new tables and the `identity` email index in `backend/src/common/db/schema.ts` (MODIFIES a slice 001/002 file)
- [x] T017 [P] Add the twelve audit actions from FR-042 to `AUDIT_ACTIONS` **and a `TARGET_ENTITY_BY_ACTION` entry for each** — the record type requires exhaustiveness — deciding none is channel-gated, in `backend/src/common/audit/actions.ts`. `audit-vocabulary-unchanged.test.ts` is a subset-and-count check on `001`/`002`'s sixteen and **needs no edit**, by its own design (MODIFIES a slice 001 file)
- [x] T018 [P] Extend the `assertNoSensitiveData` deny-list with `secret`, `code`, `digest`, `ciphertext` and `backupCode` in `backend/src/common/audit/sanitise.ts` — plan.md Constraints. Extends the existing sanitiser rather than adding a second mechanism (MODIFIES a slice 001 file)
- [x] T019 [P] Record the five new tables as deliberately unregistered in `backend/src/common/db/tenant-scoped-tables.ts`, as a comment in the shape `identity`'s already uses. **They carry no `tenant_id`, so `rls-coverage.test.ts` passes them without an exemption** — verified against that test's registry assertion, which scans for the column (MODIFIES a slice 001 file)

### Cryptographic primitives ⚠️ Write tests first, watch them fail

- [x] T020 [P] Unit test: the two Argon2id profiles are distinct, the interactive profile meets OWASP-grade parameters, and neither is reachable with the other's parameters, in `backend/tests/unit/argon2-profiles.test.ts` — [D6](./research.md#d6--argon2id-via-node-rsargon2-for-both-credentials-and-backup-codes-with-two-parameter-profiles)
- [x] T021 [P] Unit test: codes from the previous, current and next 30-second step are accepted; **every** step outside the 90-second window is refused; a used code is refused anywhere in the window, not only its own step, in `backend/tests/unit/totp-window.test.ts` — FR-020, FR-056, SC-034
- [x] T022 [P] Unit test: `KeyProvider` wraps and unwraps a data key; a ciphertext wrapped under one key reference does not unwrap under another; an unavailable key **throws rather than returning a falsy result**, in `backend/tests/unit/key-provider.test.ts` — [D5](./research.md#d5--totp-secrets-use-envelope-encryption-behind-a-keyprovider-port-kms-in-production-and-a-local-key-in-devci)
- [x] T023 [P] Unit test: generated backup codes are 128-bit random, exactly 10 per set, and no two sets collide, in `backend/tests/unit/backup-code-generation.test.ts` — FR-031
- [x] T024 Implement the two Argon2id profiles over `@node-rs/argon2` in `backend/src/common/auth/argon2.ts`, with the reduced high-entropy profile's justification stated in a comment so it is not later read as an oversight (depends on T020)
- [x] T025 Implement the `otplib` wrapper — 30-second step, 6 digits, ±1 step acceptance — in `backend/src/common/auth/totp.ts` (depends on T021)
- [x] T026 Implement the `KeyProvider` port with `KmsKeyProvider` and `LocalKeyProvider` in `backend/src/common/auth/key-provider.ts` (depends on T022)
- [x] T027 Add the startup assertion that **refuses to boot** when a deployed environment resolves the local key provider — an assertion, not a warning — in `backend/src/main.ts`, alongside the existing role-attribute assertions (MODIFIES a slice 001 file, depends on T026)
- [x] T028 Implement backup-code generation and the fixed-comparison-count `verifyAll` in `backend/src/modules/auth/backup-codes.ts` (depends on T023, T024)

### The session mechanism ⚠️ Write tests first

- [x] T029 [P] Integration test: `resolve_session()` returns an identity for a live session and nothing for an expired, revoked or unknown digest; a plaintext token never appears in the table; **`lc_app` holds no `SELECT` on `session`**, in `backend/tests/integration/session-resolution.test.ts` — FR-034, [D2](./research.md#d2--the-access-credential-is-an-opaque-high-entropy-token-not-a-signed-jwt)
- [x] T030 Implement the opaque-token session port — mint, resolve by SHA-256 digest, rotate, revoke — over the definer functions, in `backend/src/common/auth/session.port.ts` (depends on T012, T029)
- [x] T031 Implement the guard that hashes the presented access token, calls `resolve_session()`, and populates the request's identity **ahead of** `002`'s membership resolution, in `backend/src/common/auth/session.guard.ts` — [D8](./research.md#d8--session-resolution-refresh-rotation-and-family-revocation-are-each-one-security-definer-function), [D10](./research.md#d10--002s-routes-come-onto-the-network-by-replacing-the-header-stand-ins-with-the-session-guard) (depends on T030)
- [x] T032 [P] Implement the per-instance origin throttle in `backend/src/common/auth/origin-throttle.ts`, **documented in the file as best-effort and explicitly not authoritative** — it cannot be, across ECS tasks with no Redis. The per-identity lockout is the security control ([D7](./research.md#d7--lockout-is-counters-on-identity_factor-the-authentication-attempt-entity-is-counters-plus-the-existing-audit-log))

### Slice 001/002 files, extended

- [x] T033 Change the identity source from the `x-identity-id` header to the resolved session in `backend/src/common/identity/context.ts` (MODIFIES a slice 002 file, depends on T031)
- [x] T034 Take the identity from the session while **keeping `x-tenant-id`** — it names the active tenant and was never an identity claim, and removing it would break `002/FR-013` — in `backend/src/common/tenant/middleware.ts` (MODIFIES a slice 001 file, depends on T031)
- [x] T035 Pass the Argon2id digest as the fifth argument and **generate the opaque `subject` in the product** rather than reading `x-subject`, in `backend/src/modules/identity/accept-invitation.service.ts` and `backend/src/modules/identity/accept-invitation.controller.ts` — FR-053, [D9](./research.md#d9--identityemail-gains-a-unique-index-on-a-normalized-form-and-subject-becomes-a-product-generated-opaque-value) (MODIFIES slice 002 files, depends on T014, T024)

### Lockdown verification — the hard gate ⚠️ These tests are why Phase 2 exists

- [x] T036 Integration test: as the real `lc_app` role, `SELECT` on `identity_credential`, `identity_factor` and `backup_code` is **permission denied — not an empty result** — and `lc_app` holds `EXECUTE` on `resolve_session()` and on nothing else, in `backend/tests/integration/auth-grants-lockdown.test.ts` — SC-006, [D3](./research.md#d3--authentication-material-lives-in-tables-lc_app-cannot-reach-verified-inside-security-definer-functions). Modelled on `grants-lockdown.test.ts`
- [x] T037 [P] Integration test: **the regression that motivated D3** — no factor secret, credential digest or backup-code digest is reachable through `identity`'s existing `identity_self_row` `SELECT` policy. An identity reading its own row obtains no material, in `backend/tests/integration/identity-self-row-no-material.test.ts` — FR-015
- [x] T038 [P] Integration test: acceptance creates identity, membership **and** credential atomically; a failure mid-transaction leaves none of the three plus an unused invitation; and `002`'s six refusal branches still collapse identically, in `backend/tests/integration/credential-at-acceptance.test.ts` — FR-053, `002/FR-023`
- [x] T039 [P] Integration test: `lc_app` cannot insert any of the twelve new audit actions, and `lc_auth` can insert them with `tenant_id NULL`, in `backend/tests/integration/auth-audit-actions.test.ts` — FR-044, [D12](./research.md#d12--twelve-audit-actions-written-in-transaction-attributed-to-no-tenant-where-none-exists)
- [x] T040 Run `npm run test:rls` and `npm run verify:role` and confirm both pass **unchanged** — the five new tables carry no `tenant_id` so the catalogue admits them, and `lc_app` still holds no `BYPASSRLS`
- [x] T041 Run `npm run test:isolation` and confirm `001`'s isolation suite passes **unchanged**. Authentication precedes tenant selection and must not have touched it

**Checkpoint**: The data layer now holds authentication material that no application
role can read, sessions resolve, and `002`'s acceptance establishes a credential. No
flow is reachable yet.

---

## Phase 3: User Story 1 - Sign in with a credential and a second factor (Priority: P1) 🎯 MVP

**Goal**: A person proves a credential, is challenged for a second factor, and only
then holds a session. On every sign-in, with no way to be remembered. This is the story
that brings `002`'s routes onto the network and replaces `016a`'s principal fixture.

**Independent Test**: Seed one identity with a **verified** factor and a live membership
directly in the data store — no enrollment flow involved, exactly as `002`'s own P1
seeded memberships with no invitation flow. Drive a complete sign-in and assert the
second factor is demanded before any session exists, that a session exists only after
both steps succeed, and that a correct credential with a wrong second factor yields no
session and no access.

### Tests for User Story 1 ⚠️ Write first, watch them fail

- [x] T042 [P] [US1] Contract test `POST /auth/sign-in`: `200` with `next: "factor"` and **no session**; `next: "enrollment"` for an unenrolled identity; and a `401` whose body is **byte-identical** for an unknown email, a wrong credential and a locked identity, in `backend/tests/contract/sign-in.test.ts` — FR-003, FR-004, SC-017
- [x] T043 [P] [US1] Contract test `POST /auth/factor`: exactly one session emitted, `expiresAt` at 15 minutes, **no tenant and no archetype in the response**, and the uniform `401` for a wrong code, an expired `challengeToken`, a replay and an unavailable key, in `backend/tests/contract/factor.test.ts` — FR-033, FR-035, FR-037
- [x] T044 [P] [US1] **BLOCKING (SC-029)** Integration test: 100% of sign-ins demand a second factor, 0 complete on a credential alone across every archetype, 0 sessions exist before both steps succeed, and an unenrolled identity reaches 0 tenant-scoped resources, in `backend/tests/integration/mfa-enforcement.test.ts` — SC-001, SC-002, SC-003
- [x] T045 [P] [US1] Integration test: a rotated refresh token presented twice revokes **the entire family and its sessions**, and two simultaneous presentations of the same used token do not both succeed, in `backend/tests/integration/session-rotation-family.test.ts` — FR-036, SC-019
- [x] T046 [P] [US1] Integration test: 4 failures then a valid code succeeds and resets the counter; the 6th attempt is refused for 15 minutes **including when it presents a valid code**, indistinguishably from a wrong one, and the lockout lifts with no administrative action, in `backend/tests/integration/lockout.test.ts` — FR-021, FR-055, SC-032
- [x] T047 [P] [US1] Integration test: a used code is refused **anywhere** in the 90-second window; two concurrent challenges with the same valid code yield exactly one success, in `backend/tests/integration/concurrency/challenge-replay.test.ts` — FR-020, SC-018
- [x] T048 [P] [US1] Integration test: `x-identity-id`, `x-subject` and `x-email` are accepted on **0 network-reachable surfaces** while `x-tenant-id` still works, and all four remain available behind the test-only boundary, in `backend/tests/integration/stand-ins-removed.test.ts` — FR-041, SC-030, [D10](./research.md#d10--002s-routes-come-onto-the-network-by-replacing-the-header-stand-ins-with-the-session-guard)
- [x] T049 [P] [US1] Integration test: a key made unavailable at verification time fails the sign-in closed with a refusal **byte-identical to a wrong code**, in `backend/tests/integration/key-unavailable-fails-closed.test.ts` — FR-017, SC-009
- [x] T050 [P] [US1] Unit test: `getPrincipal()` reads real session state and returns the **unchanged** `Principal` shape — an identity reference plus live memberships — in `frontend/tests/unit/principal.test.ts` — FR-047, SC-024
- [x] T051 [P] [US1] Component tests for the sign-in and challenge screens: Spanish copy, no trusted-device control, uniform error message, usable at desktop **and** mobile viewports, in `frontend/tests/component/auth/SignIn.test.tsx` and `frontend/tests/component/auth/Challenge.test.tsx` — FR-049, FR-050, SC-005, SC-026

### Implementation for User Story 1

- [x] T052 [US1] Implement the credential step and the challenge step — pending-state machine between them, uniform refusal, audit writes for `signin.failed`, `signin.succeeded`, `challenge.failed` and `account.locked` — in `backend/src/modules/auth/sign-in.service.ts` (depends on T024, T025, T028, T030)
- [x] T053 [US1] Implement `POST /auth/sign-in`, `POST /auth/factor` and `POST /auth/refresh` in `backend/src/modules/auth/sign-in.controller.ts`, each **ungated by `004`** and carrying the marker that states so, so an ungated authentication route is not later filed as a defect — FR-040, [contracts/README.md](./contracts/README.md#these-routes-are-ungated-and-that-is-correct)
- [x] T054 [US1] Wire `backend/src/modules/auth/auth.module.ts` and register the session guard globally, exempting the `/auth/*` surfaces, in `backend/src/app.module.ts` (depends on T031, T053)
- [ ] T055 [US1] Remove the header stand-ins from every network-reachable path and confine them to the test-only boundary in `backend/tests/helpers/real-app.ts`, then update the now-stale `CORS_ALLOWED_ORIGINS` comment in `backend/.env.example` that says this API "trusts `x-identity-id` outright until slice 003 ships authentication" (MODIFIES slice 001/018 surfaces, depends on T033, T034)
- [x] T056 [US1] Replace `frontend/src/session/principal.ts` with a real session read and **delete `frontend/src/session/principal.fixture.json`** — one file replaced, the seam `016a`'s D5 promised. `types.ts` is unchanged (depends on T050)
- [x] T057 [US1] Implement the NextAuth Credentials provider whose `authorize()` calls the API and **verifies nothing itself**, with no database adapter and no NextAuth session strategy, in `frontend/src/app/api/auth/[...nextauth]/route.ts` — [D1](./research.md#d1--nextauth-is-the-browsers-session-transport-the-apis-session-table-is-the-sole-authority)
- [x] T058 [US1] Implement the unauthenticated and unenrolled redirects in `frontend/src/middleware.ts`, returning a person holding a backend-invalidated session **to sign-in rather than a half-populated screen** — FR-052
- [x] T059 [US1] Implement the sign-in screen in `frontend/src/app/(auth)/ingresar/page.tsx` — Spanish copy, in the `(auth)` route group **outside** the shell chrome, because a person here has no principal for `Header`, `NavigationMenu` or `TenantSwitcher` to render from (depends on T051)
- [x] T060 [US1] Implement the challenge screen in `frontend/src/app/(auth)/verificar/page.tsx` over the existing `input-otp` component, with **no trusted-device or remember-me control of any kind** — FR-019, SC-005 (depends on T051)
- [ ] T061 [US1] E2E test: a full sign-in at desktop **and** mobile viewports, plus a second sign-in from the same browser that is challenged in full, in `frontend/tests/e2e/auth-sign-in.spec.ts` — SC-005, SC-027
- [x] T062 [US1] **Run the suites of every slice that stands on `getPrincipal()` unchanged** — `016a`, `018`, `019`, plus the api-client and Spanish-copy suites — and confirm 0 failures across all 18 referencing files with 0 modifications to the function's shape. **This is the regression surface that matters most** — SC-024
- [x] T063 [US1] Confirm `git diff --name-only -- frontend/src/shell frontend/src/feedback frontend/src/authz` is **empty** — FR-048, SC-025
- [ ] T064 [US1] Re-run `002`'s full contract and integration suites against **real sessions** in place of the header stand-ins and confirm they pass — quickstart.md Scenario 8

**Checkpoint**: A seeded, enrolled person can sign in end to end; `002`'s surfaces are
on the network; the frontend reads a real principal. **This is the MVP.** Nobody can
enroll yet.

---

## Phase 4: User Story 2 - Establish a mandatory second factor (Priority: P2)

**Goal**: An identity that has accepted an invitation and not yet enrolled is required
to register an authenticator before it reaches anything, and confirms it by returning a
generated code.

**Independent Test**: Take an identity with a live membership and no verified factor.
Assert it is refused every tenant-scoped capability. Complete enrollment with a valid
derived code. Assert the same previously refused request now succeeds with nothing else
changed.

### Tests for User Story 2 ⚠️ Write first, watch them fail

- [x] T065 [P] [US2] Contract test `POST /auth/enrollment/begin` and `POST /auth/enrollment/confirm`: the secret is returned **exactly once**, an unconfirmed row satisfies no challenge, beginning again discards the prior unconfirmed secret, an enrolled identity is refused, and `confirmed_at` and `identity.mfa_enrolled_at` are set **in the same transaction**, in `backend/tests/contract/enrollment.test.ts` — FR-009 to FR-012
- [x] T066 [P] [US2] **BLOCKING (SC-029)** Integration test: **exhaustive** inspection of every environment variable, config value, plan entitlement and tenant setting, asserting 0 alter whether enrollment or the challenge occurs. **An inspection test, not a behavioural one, and exhaustive rather than sampled**, in `backend/tests/integration/mfa-no-disable-path.test.ts` — FR-007, SC-004
- [x] T067 [P] [US2] **BLOCKING (SC-029)** Integration test: a dump restored without the key yields 0 working factors; no secret appears in logs, error payloads, traces or `audit_event` after a full enrollment and sign-in; and an authenticator app is the only enrollable type with **no SMS and no email-code option on any surface**, in `backend/tests/integration/totp-secret-custody.test.ts` — FR-008, FR-013, FR-014, SC-007, SC-008
- [ ] T068 [P] [US2] Component test for the enrollment screen: the QR and the manual-entry secret, Spanish copy, both viewports, and **nothing written to `localStorage`, `sessionStorage` or IndexedDB**, in `frontend/tests/component/auth/Enrollment.test.tsx` — FR-051, SC-028

### Implementation for User Story 2

- [x] T069 [US2] Implement secret generation, envelope encryption under the `KeyProvider`, and storage with `confirmed_at IS NULL` in `backend/src/modules/auth/enrollment.service.ts`, auditing `enrollment.started` and `enrollment.failed` with **the secret in no entry** (depends on T025, T026)
- [x] T070 [US2] Implement confirmation setting `identity_factor.confirmed_at` and `identity.mfa_enrolled_at` **in one transaction** — `confirmed_at` is the fact, `mfa_enrolled_at` is `002/FR-026`'s already-shipped interface to it, and **the two must not diverge** — auditing `enrollment.completed`, in `backend/src/modules/auth/enrollment.service.ts` (depends on T069)
- [x] T071 [US2] Implement `POST /auth/enrollment/begin` and `POST /auth/enrollment/confirm` in `backend/src/modules/auth/enrollment.controller.ts`, reachable **only** by an identity past the credential step with no confirmed factor
- [x] T072 [US2] Implement the enrollment screen — QR plus manual-entry secret, then code confirmation — in `frontend/src/app/(auth)/enrolar/page.tsx` (depends on T068)
- [ ] T073 [US2] E2E test: **the walk-through that did not exist before this slice** — accept an invitation, sign in, be refused tenant data, enroll, and watch the same request succeed with nothing else changed, in `frontend/tests/e2e/auth-enrollment.spec.ts` — quickstart.md Scenario 1, US2 acceptance bar

**Checkpoint**: A real person can now become a working user without seeding. Enrollment
issues no backup codes yet, so US3 must land before this is shippable — FR-023 makes
enrollment incomplete without them.

---

## Phase 5: User Story 3 - Receive single-use backup codes at enrollment (Priority: P3)

**Goal**: Completing enrollment issues exactly 10 single-use codes, displayed once,
retrievable by nobody afterwards — including their owner.

**Independent Test**: Complete an enrollment. Assert a set is returned exactly once,
that each stored form is an irreversible digest, that consuming one invalidates that one
and leaves the rest usable, and that no surface anywhere returns the set again.

### Tests for User Story 3 ⚠️ Write first, watch them fail

- [x] T074 [P] [US3] **BLOCKING (SC-029)** Integration test: exactly 10 codes issued once; all 10 stored as irreversible memory-hard digests; consuming 1 invalidates exactly that 1 with **0 collateral invalidations**; a consumed code is refused **identically to one that never existed**; exhaustion is audited as a distinct event; and advancing the clock a year leaves all 10 valid — **no time-based expiry**, in `backend/tests/integration/backup-codes.test.ts` — FR-023 to FR-031, SC-010 to SC-016, SC-031
- [ ] T075 [P] [US3] Integration test: **enrollment does not complete without the codes** — if issuance fails the whole transaction fails and the identity remains unenrolled, with no state in which a confirmed factor exists and no codes do, in `backend/tests/integration/enrollment-atomic-with-codes.test.ts` — FR-023
- [ ] T076 [P] [US3] Integration test: **0 routes return the codes again for any archetype including SA and PO**, asserted by route-table inspection rather than by attempting each, in `backend/tests/integration/backup-codes-unreadable.test.ts` — FR-024, FR-029, SC-006
- [ ] T077 [P] [US3] Component test: the codes are presented for recording, the person must acknowledge before proceeding, and **none is written to browser storage**, in `frontend/tests/component/auth/BackupCodes.test.tsx` — FR-051, SC-028

### Implementation for User Story 3

- [x] T078 [US3] Issue exactly 10 codes inside the **same transaction** as enrollment confirmation, storing each only as a high-entropy-profile Argon2id digest and auditing `backup_codes.issued`, in `backend/src/modules/auth/enrollment.service.ts` (depends on T028, T070)
- [x] T079 [US3] Implement consumption with the fixed comparison count and `FOR UPDATE`, auditing `backup_code.consumed` and `backup_codes.exhausted` **as distinct events**, in `backend/src/modules/auth/backup-codes.ts` (depends on T011, T028)
- [x] T080 [US3] Accept a backup code at the challenge step in place of a generated code, **counting the attempt toward FR-021's counter** so recovery is not an unthrottled bypass, in `backend/src/modules/auth/sign-in.service.ts` (depends on T052, T079)
- [x] T081 [US3] Implement the one-time code presentation in `frontend/src/app/(auth)/enrolar/page.tsx`, with no re-display path anywhere in the client (depends on T077)

**Checkpoint**: Enrollment is now complete per FR-023. A lost authenticator is still
unrecoverable — US4 closes that.

---

## Phase 6: User Story 4 - Recover with a backup code and re-enroll (Priority: P4)

**Goal**: A person without their authenticator signs in, presents a backup code, and is
required to register a new authenticator before continuing — leaving with a full set of
10 fresh codes.

**Independent Test**: Seed an enrolled identity with a known set. Sign in, present one
code in place of a generated one, and assert the person is admitted to re-enrollment
only, that the consumed code cannot be reused, and that no tenant-scoped capability is
reachable until a new factor is confirmed.

### Tests for User Story 4 ⚠️ Write first, watch them fail

- [x] T082 [P] [US4] Contract test `POST /auth/recovery/backup-code` and `POST /auth/recovery/reenroll`: a satisfied challenge emits **no session**, only an `enrollmentToken`; `remainingCodes` is disclosed only after success; and re-enrollment returns a **complete new set of 10** plus a session, in `backend/tests/contract/recovery.test.ts` — FR-027, FR-028
- [ ] T083 [P] [US4] Integration test: two simultaneous recoveries presenting the same **last unconsumed** code yield exactly one success and one consumption, in `backend/tests/integration/concurrency/last-backup-code.test.ts` — [D11](./research.md#d11--backup-code-verification-tries-every-unconsumed-code-with-no-early-exit-timing-signal)
- [ ] T084 [P] [US4] Integration test: response times for a match early in the set versus late show **no usable difference**, in `backend/tests/integration/backup-code-timing.test.ts` — [D11](./research.md#d11--backup-code-verification-tries-every-unconsumed-code-with-no-early-exit-timing-signal)
- [ ] T085 [P] [US4] Integration test: recovery-path re-issuance requires **0 step-up checks**; standalone re-issuance is reachable from **0 production surfaces**; the previous factor no longer satisfies a challenge; abandoning re-enrollment leaves no access and an unenrolled identity; and an identity with all 10 consumed is refused with **no alternative path offered**, in `backend/tests/integration/recovery-reenrollment.test.ts` — FR-032, SC-015, SC-033
- [ ] T086 [P] [US4] Component test for the recovery screen: reached from the challenge screen rather than a separate flow, Spanish copy, both viewports, in `frontend/tests/component/auth/Recovery.test.tsx`

### Implementation for User Story 4

- [x] T087 [US4] Implement the backup-code challenge emitting an `enrollmentToken` and **no session**, auditing consumption, in `backend/src/modules/auth/recovery.service.ts` (depends on T079, T080)
- [x] T088 [US4] Implement forced re-enrollment **reusing the T069/T070 enrollment mechanism rather than duplicating it** — there is one way to enroll a factor in this product and recovery walks through it — replacing the previous factor, invalidating the entire previous code set, issuing 10 fresh codes and emitting one session, auditing `factor.replaced`, `backup_codes.reissued` and `signin.succeeded`, in `backend/src/modules/auth/recovery.service.ts` (depends on T069, T070, T078, T087)
- [x] T089 [US4] Implement `POST /auth/recovery/backup-code` and `POST /auth/recovery/reenroll` in `backend/src/modules/auth/recovery.controller.ts`, the latter reachable **only immediately after a satisfied recovery**
- [x] T090 [US4] Implement the recovery screen in `frontend/src/app/(auth)/recuperar/page.tsx`, reached from the challenge screen (depends on T086)
- [ ] T091 [US4] E2E test: full recovery — sign in, present a code, be refused tenant data, re-enroll, receive 10 fresh codes, and confirm every previous code is invalid, in `frontend/tests/e2e/auth-recovery.spec.ts` — quickstart.md Scenario 5

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T092 [P] Verify each of the twelve audited actions produces **exactly 1 entry — 0 missing, 0 duplicated** — and that 0 entries contain an email address, other contact detail or any factor material, in `backend/tests/integration/auth-audit-completeness.test.ts` — SC-022, SC-023
- [ ] T093 [P] Verify `mfa_not_enrolled` **remains unaudited** and remains position 1 of `004`'s refusal ordering, unreordered by this slice, in `backend/tests/unit/refusal-ordering.test.ts` — FR-039, [D12](./research.md#d12--twelve-audit-actions-written-in-transaction-attributed-to-no-tenant-where-none-exists) (MODIFIES a slice 004 file)
- [ ] T094 [P] Extend the Spanish-copy suite to the four new screens and assert **0 instances of English user-facing copy**, in `frontend/tests/component/spanish-copy.test.tsx` — FR-049, SC-026 (MODIFIES a slice 016a file)
- [ ] T095 [P] E2E test: after each of the four flows, `localStorage`, `sessionStorage` and IndexedDB hold **0 credentials, factor secrets or backup codes**, in `frontend/tests/e2e/auth-no-browser-storage.spec.ts` — FR-051, SC-028
- [ ] T096 [P] Run the three blocking suites **individually** — SC-029 requires each asserted on its own rather than discharged by an aggregate figure: `npx vitest run tests/integration/mfa-enforcement.test.ts tests/integration/mfa-no-disable-path.test.ts`, then `tests/integration/backup-codes.test.ts`, then `tests/integration/totp-secret-custody.test.ts`
- [x] T097 [P] Wire the three blocking suites into CI **on the same footing as tenant isolation** — a failure blocks the merge — in the CI workflow, and add `test:auth-coverage` to `backend/package.json` — SC-029
- [ ] T098 Walk all eight scenarios in [quickstart.md](./quickstart.md) end to end and record the outcomes, following `002`'s `quickstart-results.md` precedent, in `specs/003-authentication-mfa/quickstart-results.md`
- [ ] T099 [P] Run `npm run typecheck && npm run lint` in **both** projects, and `npm run check:env` in `backend/`
- [ ] T100 [P] Add the KMS key and its access policy for the production `KeyProvider` under `infra/`, with access restricted and audited to the PAC/CSD standard — FR-016, plan.md non-blocking item 4
- [ ] T101 Confirm the two things no test can detect, from [quickstart.md](./quickstart.md#definition-of-done): **constitution v1.5.0 is committed to `main`** (the blocker T000 could not close, `spec.md`'s first Approval Checklist item) and the T015 duplicate pre-flight was run in every environment

---

## Dependencies & Execution Order

### Phase dependencies

- **T000 is resolved**, so Phase 2 is no longer gated on a decision
- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Foundational)**: depends on Phase 1 — **blocks all four user stories**
- **Phase 3–6 (User Stories)**: all depend on Phase 2 complete, including T036–T041
- **Phase 7 (Polish)**: depends on all four stories

### The hard gate inside Phase 2

T036–T041 are not cleanup. Until they pass, there is no evidence that any of the five
tables is actually unreachable, and **every story-phase test would still be green
against grants that are wrong**. This is the same shape `002` gave its own lockdown
verification, applied to material where a wrong grant is an authentication bypass
rather than a leak.

### User story dependencies

- **US1 (P1)**: depends only on Phase 2. Testable against a **seeded** verified factor — this is what makes it the narrowest acceptance bar and why it is P1 despite following US2 in real delivery order
- **US2 (P2)**: depends only on Phase 2. Independently testable
- **US3 (P3)**: depends on **US2** — T078 extends the transaction T070 creates. Not independent, and deliberately so: FR-023 makes enrollment incomplete without codes, so US2 is not shippable until US3 lands
- **US4 (P4)**: depends on **US2 and US3** — recovery consumes a code (US3) and walks through the enrollment mechanism (US2). The last three stories form a chain; only US1 is genuinely parallel to them

### Within each story

Tests first, seen to fail. Then: primitives → service → controller → screen → e2e.

### Parallel opportunities

- T002/T003, T005/T006/T007 in Phase 1
- All four cryptographic-primitive tests (T020–T023), then their implementations
- T017/T018/T019 — three different registry files
- T037/T038/T039 — three different lockdown files
- Every test task marked [P] within a story phase
- **US1 can run fully in parallel with US2 given two developers.** US3 and US4 cannot be parallelised against US2

---

## Parallel Example: User Story 1's tests

```bash
# All ten fail before any of T052–T064 exists
Task: "Contract test POST /auth/sign-in in backend/tests/contract/sign-in.test.ts"
Task: "Contract test POST /auth/factor in backend/tests/contract/factor.test.ts"
Task: "MFA enforcement in backend/tests/integration/mfa-enforcement.test.ts"
Task: "Refresh family revocation in backend/tests/integration/session-rotation-family.test.ts"
Task: "Lockout in backend/tests/integration/lockout.test.ts"
Task: "Challenge replay in backend/tests/integration/concurrency/challenge-replay.test.ts"
Task: "Stand-ins removed in backend/tests/integration/stand-ins-removed.test.ts"
Task: "Key unavailable in backend/tests/integration/key-unavailable-fails-closed.test.ts"
Task: "Principal real read in frontend/tests/unit/principal.test.ts"
Task: "Sign-in and challenge screens in frontend/tests/component/auth/"
```

---

## Implementation Strategy

### MVP scope

**Phase 1 → Phase 2 → Phase 3 (US1).** That delivers a person who can sign in
with a credential and a second factor, `002`'s surfaces on the network, and a frontend
reading a real principal — the three things three merged slices have been waiting for.

**Stop and validate at T064.** Then decide whether to ship it. Note what it does *not*
give you: nobody can enroll, so the MVP works only for identities whose factor was
seeded. That is a genuine demo, not a releasable product.

### Incremental delivery

1. Phase 1 + Phase 2 → the data layer holds material nothing can read
2. + US1 → sign-in works against seeded factors. **Demo-able**
3. + US2 → real people can enroll. **Not yet releasable** — FR-023 fails without codes
4. + US3 → enrollment is complete and correct. **First releasable point**
5. + US4 → a lost authenticator is recoverable. **Feature-complete**
6. + Phase 7 → CI gates the three blocking paths; quickstart validated

### Parallel team strategy

1. The whole team completes Phase 1 and Phase 2 together — the grants are the
   slice, and reviewing them as a group is worth more than the parallelism forgone
2. Then: Developer A takes US1 (backend + the two screens + the `principal.ts`
   replacement); Developer B takes US2 → US3 → US4 as a chain
3. T062 and T064 — the two regression sweeps — are Developer A's, and should run
   before US3 lands so that a failure has one cause rather than two

---

## Notes

- [P] tasks touch different files with no dependency between them
- **The three suites marked BLOCKING (T044, T066, T067, T074) discharge SC-029, and the constitution requires each asserted individually.** An aggregate authentication coverage figure does not satisfy it
- **T027, T036 and T066 are the three tasks most worth reviewing twice.** Each asserts an absence, and an absence is the one thing a passing test can be wrong about silently
- Commit per task or per logical group. Stop at any checkpoint and validate the story independently
- `mfa_not_enrolled` stays unaudited (T093), agreeing with `002`'s open item 3: a precondition failure by a legitimate member is not a change of state
- Five capabilities now await `005`'s step-up mechanism — `002`'s four plus standalone backup-code re-issuance (FR-032). Recorded so the count is not lost between slices
