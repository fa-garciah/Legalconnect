# Quickstart: Authentication & Multi-Factor Enrollment

**Slice**: `003-authentication-mfa` | **Date**: 2026-09-09

How to prove this slice works end to end. Validation scenarios and the commands that run
them — not implementation. Entity shapes are in [data-model.md](./data-model.md), route
shapes in [contracts/](./contracts/), decisions in [research.md](./research.md).

## Prerequisites

```bash
# Backend — PostgreSQL via docker compose, then migrations
cd backend
npm install
npm run db:up
npm run db:migrate          # must include 0030–0036
npm run db:seed             # one tenant, one pending invitation

# Frontend
cd ../frontend
npm install
npx playwright install      # e2e only
```

**Required environment.** Add to `backend/.env` (and to `.env.example`, which
`npm run check:env` verifies):

| Variable | Purpose |
|---|---|
| `AUTH_KEY_PROVIDER` | `local` or `kms` ([research D5](./research.md#d5--totp-secrets-use-envelope-encryption-behind-a-keyprovider-port-kms-in-production-and-a-local-key-in-devci)) |
| `AUTH_LOCAL_KEY` | 32-byte base64 key. **Dev and CI only** |
| `AUTH_KMS_KEY_ID` | Required when the provider is `kms` |
| `AUTH_LOCKOUT_THRESHOLD` | 5 (FR-021) |
| `AUTH_LOCKOUT_MINUTES` | 15 (FR-021) |
| `AUTH_BACKUP_CODE_COUNT` | 10 (FR-031) |

> **These are parameters, not switches.** None of them can disable enrollment or the
> challenge. FR-007 forbids such a value existing, and `mfa-no-disable-path.test.ts`
> asserts it exhaustively rather than by sampling (SC-004). A startup assertion must refuse
> `AUTH_KEY_PROVIDER=local` in any deployed environment.

## Run everything

```bash
cd backend  && npm test          # unit + contract + integration
cd frontend && npm test          # unit + component
cd frontend && npm run test:e2e  # Playwright, desktop + mobile viewports
```

### The three blocking suites, individually

SC-029 requires each of the constitution's three authentication coverage paths to be
asserted on its own, not discharged by an aggregate figure:

```bash
cd backend
npx vitest run tests/integration/mfa-enforcement.test.ts \
               tests/integration/mfa-no-disable-path.test.ts
npx vitest run tests/integration/backup-codes.test.ts
npx vitest run tests/integration/totp-secret-custody.test.ts
```

Also still blocking, unchanged from `001`/`002`:

```bash
npm run test:isolation   # must pass unchanged
npm run test:rls         # RLS catalogue — the 5 new tables carry no tenant_id, so they pass
npm run verify:role      # lc_app must hold no BYPASSRLS
```

---

## Scenario 1 — A new person becomes a working user

Proves FR-053, FR-006, FR-009, FR-023, and that `002/FR-026`'s precondition is finally
satisfiable. This is the walk-through that did not exist before this slice.

1. **Accept an invitation, setting a credential.** Use the seeded pending invitation.
   Expect exactly one identity, one live membership and one `identity_credential`, created
   atomically. Kill the process mid-transaction and expect **none** of the three, plus an
   unused invitation (FR-053, `credential-at-acceptance.test.ts`).
2. **Sign in.** `POST /auth/sign-in`. Expect `200` with `next: "enrollment"` and **no
   session** (FR-003).
3. **Try to reach tenant data with no session.** Expect refusal. Try with the
   `challengeToken`. Expect refusal — it is not an access token.
4. **Begin enrollment.** Expect a secret and an `otpauth://` URI, once. Confirm the stored
   `identity_factor` row has `confirmed_at IS NULL` and that
   `identity.mfa_enrolled_at` is still `NULL`.
5. **Confirm with a derived code.** Expect `200` with **exactly 10** backup codes and a
   session. Confirm `confirmed_at` and `mfa_enrolled_at` were set in the *same* transaction
   (FR-011).
6. **Reach tenant data.** The same request that failed at step 3 now succeeds, with nothing
   else changed. **This is the acceptance bar for User Story 2.**

**Expected**: 1 identity, 1 membership, 1 credential, 1 confirmed factor, 10 unconsumed
codes, 1 live session. Audit log holds `enrollment.started`, `enrollment.completed`,
`backup_codes.issued`, `signin.succeeded` — each exactly once, `tenant_id NULL`, no email
and no factor material anywhere in them (SC-022, SC-023).

## Scenario 2 — The second factor is not optional

Proves FR-006, FR-007, FR-018, FR-019 — the constitution's hardest requirements here.

1. Seed an identity with a credential and **no** confirmed factor. Every tenant-scoped
   request must be refused with `mfa_enrollment_required` and return no tenant data
   (SC-003).
2. Sign in and complete the challenge. Sign in **again from the same browser and device**.
   Expect the challenge in full — no remembered device, and **no surface offering one**
   (FR-019, SC-005).
3. **Search exhaustively for a disable path.** Every environment variable, config value,
   plan entitlement and tenant setting. Expect zero that alter whether enrollment or the
   challenge occurs (SC-004). This is an inspection test, not a behavioural one, and it is
   blocking.
4. Enumerate every enrollable factor type. Expect authenticator-app only — **no SMS option
   anywhere**, and no email-code option (FR-008).

## Scenario 3 — A factor secret is not readable by anyone

Proves FR-013 to FR-017 and D3's whole reason for existing.

1. As `lc_app`, attempt `SELECT` on `identity_factor`, `identity_credential` and
   `backup_code`. Expect **permission denied on all three** — not empty results
   (SC-006).
2. **The regression that motivated D3:** confirm no factor secret is reachable through
   `identity`'s existing `identity_self_row` policy. An identity reading its own row must
   obtain no secret material.
3. Dump the database, restore it without `AUTH_LOCAL_KEY`, and attempt to derive a working
   code. Expect failure (FR-013, SC-008).
4. Make the key unavailable and sign in. Expect refusal **byte-identical to a wrong code**
   (FR-017, SC-009).
5. Grep logs, error payloads, traces and `audit_event` for secret material after a full
   enrollment and sign-in. Expect zero occurrences (SC-007).

## Scenario 4 — Backup codes behave as single-use

Proves FR-023 to FR-031.

1. Confirm all 10 stored values are Argon2id digests, none reversible (SC-011).
2. Consume one. Expect that one invalid, the other 9 valid (SC-012). Present it again;
   expect refusal identical to a code that never existed (SC-013, SC-016).
3. Look for any route returning the codes again. Expect none, for any archetype including
   SA and PO (FR-024, FR-029).
4. Consume all 10. Expect `backup_codes.exhausted` audited once, and recovery refused with
   **no alternative path offered** — the terminal state in Named Risks (US4 scenario 6).
5. Advance the clock a year with codes unused. Expect all 10 still valid — **no time-based
   expiry** (SC-031).

## Scenario 5 — Recovery restores a full set

Proves FR-027, FR-028, FR-032.

1. Sign in, present a backup code at the challenge. Expect challenge satisfied, code
   consumed, **no session** (FR-027, SC-015).
2. Attempt tenant data before re-enrolling. Expect refusal.
3. Abandon. Expect no access and the identity still unenrolled (US4 scenario 4).
4. Complete re-enrollment. Expect a session, the old factor no longer satisfying a
   challenge, and **10 fresh codes** with all previous ones invalid (SC-033, SC-014).
5. Confirm **no step-up check** was required inside the recovery flow, and that standalone
   re-issuance is reachable from **zero** production surfaces (FR-032, SC-033).

## Scenario 6 — Concurrency and the acceptance window

Proves FR-020, FR-021, FR-056 and the races [research D8](./research.md#d8--session-resolution-refresh-rotation-and-family-revocation-are-each-one-security-definer-function) and [D11](./research.md#d11--backup-code-verification-tries-every-unconsumed-code-with-no-early-exit-timing-signal) name.

1. **Window**: accept codes from the previous, current and next 30-second step; reject
   anything outside. Confirm a used code is refused **anywhere** in that 90-second window,
   not just its own step (FR-020, SC-034).
2. **Same-code race**: two simultaneous challenges with the same valid code. Expect exactly
   one success.
3. **Last-code race**: two simultaneous recoveries with the same last unconsumed code.
   Expect exactly one success and one consumption.
4. **Lockout**: 4 failures then a valid code — success, counter reset. 5 failures then a
   *valid* code — refused for 15 minutes, indistinguishable from a wrong code, lifting with
   no administrative action (SC-032).
5. **Refresh reuse**: rotate, then present the old token. Expect the **entire family**
   revoked, including its sessions (FR-036, SC-019).
6. **Timing**: compare response times for a matching code early in the set versus late.
   Expect no usable difference (D11).

## Scenario 7 — The frontend reads a real principal

Proves FR-046 to FR-052 and SC-024 — the second seam this slice closes.

```bash
cd frontend && npm test && npm run test:e2e
```

1. Confirm `principal.fixture.json` is **deleted** and `getPrincipal()` reads the session.
2. **Run the suites of every slice that stands on it unchanged** — `016a`, `018`, `019`,
   plus the api-client and Spanish-copy suites. Expect zero modifications to the function's
   shape and zero failures across all 18 referencing files (SC-024). **This is the
   regression surface that matters most.**
3. Confirm **zero** files under `src/shell/`, `src/feedback/` or `src/authz/` were modified
   (FR-048, SC-025) — `git diff --name-only` against those paths must be empty.
4. Sign in end to end in a real browser, at desktop **and** mobile viewports (SC-027).
5. Confirm all copy on the four screens is Spanish (SC-026).
6. After each flow, inspect `localStorage`, `sessionStorage` and IndexedDB for credentials,
   secrets or backup codes. Expect none (FR-051, SC-028).
7. Hold a session the backend has revoked, then load a screen. Expect a return to sign-in,
   not a half-populated page (FR-052).

## Scenario 8 — 002's surfaces come onto the network

Proves FR-041 and SC-030.

1. Reach each of `002`'s surfaces — invitation issue/revoke/list, accept,
   enumerate-own-memberships, membership revoke/archetype-change, seed — with a **real
   session** in place of the header stand-ins.
2. Attempt each with `x-identity-id`, `x-subject` or `x-email` on a network-reachable path.
   Expect the headers ignored entirely (SC-030, `stand-ins-removed.test.ts`).
3. Confirm `x-tenant-id` **still works** — it names the active tenant and was never an
   identity claim (D10).
4. Re-run `002`'s full contract and integration suites. Expect them green.

---

## Definition of done

| Check | Command / method |
|---|---|
| Three blocking coverage suites pass individually | The three `vitest` invocations above (SC-029) |
| `001` isolation suite passes unchanged | `npm run test:isolation` |
| RLS catalogue passes | `npm run test:rls` — 5 new tables carry no `tenant_id` |
| `002` suites pass with real sessions | `npm run test:contract && npm run test:integration` |
| Frontend consumers pass unchanged | `cd frontend && npm test` (SC-024) |
| Shell modules untouched | `git diff --name-only -- frontend/src/shell frontend/src/feedback frontend/src/authz` is empty |
| No disable path exists | `mfa-no-disable-path.test.ts` (SC-004) |
| No secret material anywhere | `totp-secret-custody.test.ts` + log grep (SC-007) |
| Stand-ins gone | `stand-ins-removed.test.ts` (SC-030) |
| Env example current | `npm run check:env` |
| Types and lint clean | `npm run typecheck && npm run lint`, both projects |

**Two things this quickstart cannot verify, and neither is optional:**

1. **Constitution v1.5.0 must be committed to `main`.** No test detects this. It is the
   first item on `spec.md`'s Approval Checklist and the blocking item in
   [plan.md](./plan.md#blocking-item--procedural-not-a-principle-violation).
2. **`identity.email` duplicates must be checked before `0035` runs.** The unique index
   fails on any environment already holding two identities with the same normalized email.
   Pre-flight query per environment; see plan.md non-blocking item 2.
