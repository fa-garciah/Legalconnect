# Quickstart Results — 003-authentication-mfa

**Recorded**: 2026-09-10 · Following `002`'s `quickstart-results.md` precedent.

**What this document is.** `quickstart.md` describes eight scenarios a person walks by
hand. This records what was actually verified, by what means, and — the part worth more
than the ticks — **what was not**.

**How to read the Means column.** "Automated" means a test in the suite asserts it and
that test is green. "By hand" means somebody drove it. "Not verified" means neither, and
says why.

---

## Summary

| # | Scenario | Verdict | Means |
|---|---|---|---|
| 1 | A new person becomes a working user | **Verified** | Automated |
| 2 | The second factor is not optional | **Verified** | Automated, blocking |
| 3 | A factor secret is not readable by anyone | **Verified** | Automated, blocking |
| 4 | Backup codes behave as single-use | **Verified** | Automated, blocking |
| 5 | Recovery restores a full set | **Verified** | Automated |
| 6 | Concurrency and the acceptance window | **Verified** | Automated |
| 7 | The frontend reads a real principal | **Partially verified** | Automated at the unit and component level; **not** end to end in a browser |
| 8 | `002`'s surfaces come onto the network | **Verified** | Automated |

---

## Scenario 1 — A new person becomes a working user

**Verified.** `tests/integration/credential-at-acceptance.test.ts` and
`tests/contract/enrollment.test.ts` walk it: accept an invitation, sign in, be routed to
enrollment, register a factor, receive ten codes, and hold a session.

This is the walk-through that **did not exist before this slice**. `002/FR-026` refuses
tenant data until enrollment completes, `004` fixed that refusal as position 1 of its
ordering, and nothing could produce the enrolled state. Three merged slices described a
product no real person could enter; scenario 1 is the proof that they can now.

## Scenario 2 — The second factor is not optional

**Verified, blocking.** `tests/integration/mfa-enforcement.test.ts` (9 tests) and
`mfa-no-disable-path.test.ts` (6). 100% of sign-ins demand a factor across all six
internal archetypes, 0 complete on a credential alone, and 0 sessions exist before both
steps succeed.

The no-disable check is an **inspection** test, exhaustive over every key in
`.env.example` and every entitlement in the registry, plus a codebase-wide scan for any
identifier naming such a switch. A behavioural test could not establish this: flipping
the values you thought of says nothing about the one nobody thought of.

## Scenario 3 — A factor secret is not readable by anyone

**Verified, blocking.** `totp-secret-custody.test.ts` (7) and `auth-grants-lockdown.test.ts`
(21). A dump restored without the key yields 0 working factors — the test reads the
stored bytes as a restored backup would expose them and confirms an attacker holding
both the dump and their own key gets nothing.

`lc_app` is **denied**, not filtered: `permission denied` on all five tables, 0
column-level privileges, and `EXECUTE` on exactly one function.

## Scenario 4 — Backup codes behave as single-use

**Verified, blocking.** `backup-codes.test.ts` (10),
`concurrency/last-backup-code.test.ts` (3), `backup-code-timing.test.ts` (4). Ten codes,
issued once, stored as digests verified to actually be of those codes; consuming one
invalidates exactly one; ten concurrent attempts on the last code yield exactly one
success.

## Scenario 5 — Recovery restores a full set

**Verified.** `tests/contract/recovery.test.ts` (8). A satisfied challenge emits **no
session**, the previous factor stops working, and re-enrollment returns a complete new
set of ten.

## Scenario 6 — Concurrency and the acceptance window

**Verified.** `concurrency/challenge-replay.test.ts` (5), `session-rotation-family.test.ts`
(6), `lockout.test.ts` (6). Two concurrent challenges with one valid code yield exactly
one session; a used code is refused anywhere in the 90-second window; reuse of a rotated
refresh token revokes the whole family.

## Scenario 7 — The frontend reads a real principal

**PARTIALLY VERIFIED, and this is the honest gap in this slice.**

What is verified: `getPrincipal()` reads a real session and its **shape is unchanged**
(`tests/unit/principal.test.ts`), and all 37 frontend test files / 377 tests pass with
`principal.fixture.json` deleted. `git diff` over `src/shell`, `src/feedback` and
`src/authz` is empty, so `016a`'s module contract survives.

What is **not** verified: the browser journey end to end. T061, T073, T091 and T095 are
Playwright specs and were not written — they need Postgres, the API on 3001, Next on
3000 and a browser, and running that stack was outside what this pass could do
honestly. The production build compiles with all four routes and the proxy registered,
which is evidence the wiring is sound and **not** evidence that a person can sign in
through a browser.

There is also an open design question recorded in `.spec-context.json`: how the browser
presents its credential on direct API calls. The server path is settled; `api-client.ts`
runs in the browser where the credential is httpOnly by design, and the choice between
a route-handler proxy and same-site cookie auth has not been made.

## Scenario 8 — `002`'s surfaces come onto the network

**Verified.** `stand-ins-removed.test.ts` (6). 0 files under `src/**` read
`x-identity-id`, `x-subject` or `x-email`; presenting them buys nothing on any surface;
`x-tenant-id` still works behind a real session; and a session cannot be redirected by a
header naming another identity.

Two real reads were found and removed during this: `004`'s interceptor still read the
header for the identity-only surface — the worst place, since that value feeds
`self`-scoped decisions — and `main.ts` still allowed it through CORS.

---

## Definition of done — the two things no test can detect

`quickstart.md` names two, and both are recorded here rather than assumed.

### 1. Constitution v1.5.0 committed to `main` — **NOT DONE**

Committed to the branch `constitution-v1.5.0-self-hosted-identity` and pushed. **Not
merged.** `spec.md`'s first Approval Checklist item makes this a precondition of this
slice's approval, so **003 cannot merge until it does**. It is a self-approval: the CC
technical lead is the person who opened it.

### 2. The T015 duplicate pre-flight, in every environment — **DONE, one environment**

Run against local development, the only environment that exists. It found **7 duplicate
normalized email groups**, all residue from repeated `002` suite runs, and the guard in
migration `0035` fired correctly, naming the count and the addresses before any DDL ran.
Remediated by rebuilding the database.

**There is no staging and no production to run it against.** The AWS account is blocked
(constitution, Data Residency `[PENDING]`), so nothing has ever been deployed. When an
environment first exists, this pre-flight must run there **before** `0035` is allowed to
apply — the guard will refuse the migration rather than corrupt anything, but a deploy
failing on a data condition is a worse way to learn it.

---

## Known gaps, stated plainly

1. **No e2e coverage.** Four Playwright specs unwritten (T061, T073, T091, T095).
2. **Browser credential transport undecided** — see Scenario 7.
3. **`dependency-scan` will fail on `backend`** for pre-existing critical CVEs in the
   `vitest` devDependencies. Predates 003; needs its own bump PR. That gate has been
   passing only because nothing was running it.
4. **One flaky test**: `provision-seeds-catalog.test.ts` FR-009 failed once in a full run
   and passed on the next and twice in isolation. Not 003 logic — almost certainly shared
   database state — but worth pinning down before CI depends on it.
5. **The platform surface is still unauthenticated.** `SessionGuard` exempts
   `@PlatformSurface()` because there is no PO identity to hold a session. `001`'s
   loopback binding remains the only control there.
