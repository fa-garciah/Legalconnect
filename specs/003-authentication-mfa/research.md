# Phase 0 Research: Authentication & Multi-Factor Enrollment

**Slice**: `003-authentication-mfa` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

Twelve decisions. Two of them (D1, D2) are the questions `spec.md` explicitly refused
to answer and deferred here by name. The rest follow from applying slice 002's
data-layer discipline to material that is more sensitive than anything the product has
held before.

> **Citation convention.** `001/`, `002/`, `004/`, `016a/` prefix earlier slices'
> requirements and decisions. Bare `FR-0NN` / `SC-0NN` are this slice's.

---

## D1 — NextAuth is the browser's session transport; the API's session table is the sole authority

**Decision.** NextAuth (Auth.js) runs only in the Next.js frontend, and only to conduct
the browser side of the sign-in ceremony and hold the resulting cookie. It verifies
nothing. Its Credentials provider's `authorize()` callback calls the NestJS API's
authentication endpoints and returns whatever the API decides.

Concretely:

- **No NextAuth database adapter, and no NextAuth session strategy on the API side.**
  No `accounts`, `sessions`, `verification_tokens` or `users` tables from NextAuth's
  schema are created. The product's own `session` table is the only session store.
- Credential verification, TOTP verification and backup-code consumption all execute
  inside the NestJS API, because each touches material the frontend must never see and
  each must be audited in the same transaction as the state change it causes.
- The access credential the API emits is carried in NextAuth's encrypted cookie as
  opaque payload. The cookie is transport, not proof.
- Every API request re-validates against the `session` table (FR-034, SC-020).

**Rationale.** The constitution names NextAuth as the identity provider *and* requires
that "the API MUST validate every request against this product's own session state,
never against a bearer token's signature and expiry alone." Those two statements are
only compatible if NextAuth is not an authority. Letting NextAuth hold its own session
notion alongside the product's would recreate precisely the divergence the v1.5.0
amendment claims self-hosting removes — "no second system holding a parallel notion of
session validity" — except this time the second system would be one we built.

There is also a plainer reason: the API is NestJS and is called by more than the browser.
An authentication design that only works when the caller is a Next.js server component
is not an authentication design.

**Alternatives considered.**

- *NextAuth with its Drizzle adapter and database session strategy, treated as the
  session store.* Rejected: it puts session lifetime and revocation semantics inside a
  library, where `005` cannot extend them per role class and `US09`/`US10` cannot
  enumerate or revoke them. It also makes the API's validity check a read of a
  library-owned table whose shape the library controls.
- *Drop NextAuth entirely; the frontend calls the API directly and stores the token
  itself.* Genuinely tempting, and technically sufficient. Rejected because the
  constitution names the NextAuth Credentials provider as a load-bearing dependency
  under Principle II's blast radius — removing it is an amendment, not a plan decision.
  What this decision does instead is confine it to the role it is good at: cookie
  handling, CSRF, and the redirect dance.

---

## D2 — The access credential is an opaque high-entropy token, not a signed JWT

**Decision.** A 256-bit random token, transmitted to the client and stored server-side
only as a SHA-256 digest. No claims, no signature, no client-readable structure. The
`session` row is looked up by digest on every request.

**Rationale.** Both shapes satisfy FR-034 on paper. The opaque token satisfies it under
maintenance, which is the property that matters. A signed JWT carrying a session pointer
invites exactly one bug: a future handler that verifies the signature, reads `exp`, and
returns early without the session lookup. That code passes review, passes tests, and
silently converts the product to the stateless JWT the constitution prohibits. An opaque
token has no locally verifiable content, so there is nothing to check instead of the
database — the failure mode is unavailable rather than latent.

Cost is one indexed lookup per request. That cost is already paid: `002` performs a
membership resolution query on the per-request hot path, and the session lookup is a
single-row primary-key-shaped read that resolves before it. SHA-256 rather than a
memory-hard function is correct here and is not a departure from the constitution's
hashing rules: those govern *user-chosen or user-held secrets* (credentials, backup
codes), where the threat is offline brute force against low entropy. A 256-bit random
token has no brute-force surface, and a per-request Argon2id verification would add tens
of milliseconds to every call for no gain.

**Alternatives considered.**

- *Signed JWT carrying a session id.* Rejected on the maintenance argument above. The
  usual justification — avoiding a database round trip — does not apply when the
  constitution forbids trusting the token without one.
- *Opaque token stored in plaintext server-side.* Rejected: a database dump would then
  yield live sessions. The digest makes a dump useless for impersonation, at the cost of
  nothing, since lookup is by digest either way.

---

## D3 — Authentication material lives in tables `lc_app` cannot reach, verified inside `SECURITY DEFINER` functions

**Decision.** A new role `lc_auth` owns four new tables — `identity_credential`,
`identity_factor`, `backup_code`, `session` (and `refresh_token`) — and `lc_app` holds
**no grant of any kind** on the first three. Verification, consumption and session
resolution happen inside `SECURITY DEFINER` functions owned by `lc_auth` that take a
candidate and return a verdict, never the material.

> **Amended 2026-09-09, second clause only.** The first clause stands and is
> strengthened: `lc_app` now holds no grant on **any** of the five tables, and `EXECUTE`
> on exactly one function. The second clause — verification *inside* the functions — was
> found unbuildable while generating `tasks.md`, for three independent reasons: Argon2id
> digests are salted, so no comparable candidate can be derived without first reading the
> stored digest; the envelope key that unwraps a factor secret is held by the application
> and deliberately not by the database (D5, FR-013); and `@node-rs/argon2` does not exist
> inside PostgreSQL, while D4 rejects `pgcrypto` explicitly and RDS admits no PL/Rust.
>
> **The material must therefore cross into the application, and the decision is which
> connection receives it.** `lc_auth` becomes `LOGIN`, held by
> `backend/src/modules/auth/` and by nothing else. The `SECURITY DEFINER` functions are
> retained where atomicity and race control need them — FR-020's replay guard, FR-021's
> counter, D11's consumption race, FR-036's family revocation, and `resolve_session()` on
> the per-request path — rather than as a secrecy mechanism they cannot provide.
>
> The rationale below is unaffected: it argues for separate ungranted tables over columns
> on `identity`, and that argument is what this amendment preserves. See
> [data-model.md](./data-model.md#roles) for the corrected grants and
> [tasks.md T000](./tasks.md#blocking-design-question--resolved-2026-09-09) for the full
> reasoning.

**Rationale.** This is 002's D4 argument applied to material that deserves it more. FR-015
and FR-029 say no archetype may read a TOTP secret or a backup code, "including PO and
SA". Per Principle II that is a data-layer guarantee, not an application-layer one — and
here the application-layer version is worse than usual, because the natural place to put
these columns is on `identity`, which already carries a **self-row SELECT policy for
`lc_app`** (`0012_identity.sql`). Putting the TOTP ciphertext on `identity` would make it
readable by its own owner through an existing, correct, already-tested policy. That is
precisely the disclosure FR-015 forbids, arrived at by accident.

Separate tables with no grant remove the possibility rather than reduce it. A handler
that tries to read a backup code hash does not leak; it fails.

**Alternatives considered.**

- *Columns on `identity`, protected by narrowing the self-row policy to specific
  columns.* Rejected: PostgreSQL column-level privileges and RLS interact in ways that
  are easy to get subtly wrong, and the narrowing would have to be re-verified on every
  future migration touching `identity`. A table with no grant needs no re-verification.
- *Application-layer checks that simply never select the sensitive columns.* Rejected as
  the "developer forgets the filter" mode Principle II exists to eliminate.

---

## D4 — Credential establishment extends `accept_invitation()`; it does not add a second path

**Decision.** `accept_invitation()` gains a parameter carrying a pre-computed Argon2id
digest of the chosen credential, and inserts the `identity_credential` row inside its
existing transaction. Because adding a parameter creates a new signature rather than
replacing one, the migration `DROP`s the four-argument function and creates the
five-argument one, so no ambiguous overload survives.

The digest is computed in the application, never in SQL — the plaintext credential must
not appear in a query, a parameter log, or `pg_stat_statements`.

**Rationale.** FR-053 requires establishment to be atomic with identity and membership
creation, and `002/FR-023` already guarantees exactly that atomicity for those two. The
function is the only path that can insert an `identity` row at all, so any other
placement would either need a second privileged path into `identity` or would leave a
window where a membership exists with no credential — the state FR-053's last sentence
forbids and FR-006 would refuse anyway.

**Alternatives considered.**

- *A separate `establish_credential()` function called immediately after acceptance.*
  Rejected: two functions, two transactions, and a real window between them. "Immediately
  after" is not atomicity.
- *Hashing inside the function using `pgcrypto`.* Rejected: it puts the plaintext
  credential into a SQL parameter, and `pgcrypto` offers no Argon2id.

---

## D5 — TOTP secrets use envelope encryption behind a `KeyProvider` port, KMS in production and a local key in dev/CI

**Decision.** A `KeyProvider` interface with two implementations: a KMS-backed one for
deployed environments, and a local one reading a key from the environment for
development and CI. `identity_factor` stores the ciphertext plus a key reference, so a
rotation is a re-wrap rather than a re-enrollment.

**Rationale.** The constitution requires the key to be "an application-held key that is
separate from the database — envelope encryption or KMS," and requires key access to be
restricted and audited to the PAC/CSD standard. KMS in `mx-central-1` satisfies that and
is on the constitution's verified-available list.

The port exists because of the `[PENDING]` the constitution itself records: the AWS
account blockage may be account-wide rather than scoped to Cognito. If it is account-wide,
KMS is unreachable too — and the entire reason slice 003 was unblocked by the v1.5.0
amendment was to stop a blocked account from halting authentication. Hard-wiring KMS
would reintroduce that halt through a different door. The port keeps the slice buildable
and testable today and makes the production key source a deployment decision rather than
a code change.

**The local implementation is not a fallback in production.** Configuration must fail
closed if a deployed environment resolves the local provider — a startup assertion, not a
warning.

**Alternatives considered.**

- *KMS directly, no port.* Rejected on the blockage argument. It also makes every test
  that touches enrollment require AWS credentials, which contradicts the Testcontainers
  discipline every prior slice uses.
- *A key in Secrets Manager, read at boot.* Still AWS, so it does not address the
  blockage, and it holds the raw key in process memory for the process's lifetime rather
  than wrapping per-secret data keys. Acceptable as the local provider's shape; not as
  the production one.

---

## D6 — Argon2id via `@node-rs/argon2` for both credentials and backup codes, with two parameter profiles

**Decision.** One dependency, `@node-rs/argon2` (prebuilt binaries, no `node-gyp`), used
for both. Two documented profiles:

| Profile | Used for | Why it differs |
|---|---|---|
| Interactive | Credentials | User-chosen, low-entropy, offline-brute-forceable. OWASP-grade parameters. |
| High-entropy | Backup codes | 128-bit random, generated by us. No meaningful brute-force surface, and up to 10 verifications occur per attempt. |

**Rationale.** The constitution permits "Argon2id or scrypt" and Argon2id is the stronger
of the two. Using one function for both keeps a single hashing code path — the thing most
worth not duplicating in an authentication layer.

The two profiles exist because a backup code is not a password. Verification must try the
identity's unconsumed codes until one matches (D11), so interactive-grade parameters would
put roughly half a second on every recovery attempt to defend entropy the codes already
have. The reduced profile is justified by that entropy and is documented so it is not
later read as an oversight.

`node:crypto`'s built-in `scrypt` was the tempting zero-dependency option. Rejected
because the constitution names `otplib` and the credential verifier as load-bearing
dependencies to be pinned and security-reviewed — one deliberate, pinned, reviewed
Argon2id dependency fits that posture better than hand-tuned scrypt parameters, and
Argon2id is what a reviewer expects to find.

---

## D7 — Lockout is counters on `identity_factor`; the "Authentication attempt" entity is counters plus the existing audit log

**Decision.** FR-021's threshold is enforced by `failed_attempt_count` and `locked_until`
columns on `identity_factor`, updated atomically inside the verification function. No new
attempt-log table is created. `spec.md`'s **Authentication attempt** entity is realized by
those counters plus `audit_event`, which FR-042 already requires to record every attempt
and outcome.

FR-005's *per-origin* clause is served separately and is explicitly **not authoritative**:
a per-instance in-memory limiter, best-effort, documented as defence against noise rather
than a security control. The per-identity lockout is the security control.

**Rationale.** Counters are correct under concurrency for free — `UPDATE ... SET count =
count + 1 RETURNING` is atomic, whereas deriving "5 consecutive failures" by aggregating
an attempt log requires a window function over rows that other transactions are inserting.
And a third store would duplicate `audit_event`, which already holds every attempt with
its outcome and is append-only and immutable by construction.

The honesty about per-origin matters. Shared-instance memory cannot be authoritative
across ECS tasks, and there is no Redis in the stack. Claiming an authoritative
origin-based control without the infrastructure for it would be a false assurance in the
one document meant to prevent those.

**Alternatives considered.**

- *A dedicated `authentication_attempt` table.* Rejected on the concurrency and
  duplication arguments. Reconsider if `US09`/`US10`'s session inventory later wants a
  per-attempt device history — that is `005`'s call, not this slice's.
- *Redis for both counters and origin throttling.* Rejected: it adds infrastructure to
  the critical authentication path for a counter PostgreSQL increments correctly.

---

## D8 — Session resolution, refresh rotation and family revocation are each one `SECURITY DEFINER` function

**Decision.** Three functions owned by `lc_auth`:

- `resolve_session(token_digest)` → `(identity_id, expires_at)` or nothing. `lc_app` may
  execute it and holds no grant on `session` itself.
- `rotate_refresh(token_digest, device)` → a new pair, or a reuse verdict.
- Family revocation on detected reuse, inside `rotate_refresh`'s own transaction.

**Rationale.** FR-036's family revocation is a read-then-write race by nature: two
requests presenting the same already-rotated token must not both succeed, and exactly one
must trigger revocation of the whole family. `SELECT ... FOR UPDATE` on the family root
inside one function makes that hold, the same mechanism `002/D1` used for concurrent
invitation acceptance (`002/SC-005`). Split across application statements it does not hold.

Keeping `session` ungranted to `lc_app` also means token digests are not enumerable by a
signed-in caller, which a self-row policy could not achieve anyway: session lookup happens
*before* `app.identity_id` is set, so there is no identity for a policy to compare against.

---

## D9 — `identity.email` gains a unique index on a normalized form, and `subject` becomes a product-generated opaque value

**Decision.** Two schema corrections that self-hosting forces:

1. **A unique index on `lower(btrim(email))`.** `identity.email` is currently `NOT NULL`
   with no uniqueness (`0012_identity.sql` constrains only `subject`). Sign-in resolves an
   identity *by email*, which requires it to identify at most one row.
2. **`subject` becomes an opaque value this product generates** at acceptance, rather than
   an external provider's identifier. It stays `NOT NULL UNIQUE`, so `002/FR-003` keeps its
   meaning, and it is deliberately **not** the email.

**Rationale.** Under Cognito the user pool enforced email uniqueness and issued the
subject. Both jobs are now ours, and the absence of the unique index is a live gap rather
than a design choice — two identities could already hold the same email today, and a
credential sign-in against that state is ambiguous in the worst possible place. The index
must be added with the duplicate check that migration implies.

Keeping `subject` distinct from email is what keeps Technical Debt item 6 (email change)
tractable: an identity whose email changes keeps its subject, its credential, its factor
and its memberships. Had subject been the email, an email change would be an identity
change.

Normalization is `lower(btrim(...))` and nothing cleverer — no Unicode folding, no
plus-address stripping. Anything more is a policy decision about who counts as the same
person, which belongs in a spec rather than an index.

---

## D10 — 002's routes come onto the network by replacing the header stand-ins with the session guard

**Decision.** The `x-identity-id`, `x-tenant-id`, `x-subject` and `x-email` stand-ins
`002/research.md` D10 introduced are removed from every network-reachable path and
replaced by a guard that resolves the identity from the session (D8). `x-tenant-id`
survives as the *caller-named* active tenant — it was never a claim of identity, and
`002/FR-016` already requires the tenant to be membership-verified rather than trusted.

The stand-ins remain available in tests only, behind the same test-only boundary
`001/contracts/README.md` describes.

**Rationale.** SC-030 requires the stand-ins accepted on zero network-reachable surfaces.
`002`'s D10 was explicit that its posture was conditional on this slice: "Real verification
does not exist until slice 003." This is the slice, so the condition is discharged rather
than extended.

The asymmetry between the identity headers and `x-tenant-id` is deliberate and worth
stating, because deleting all four would break `002/FR-013`: naming which tenant to
activate is the caller's job and always was. What must not be trusted is *who the caller
is*, and that is what moves to the session.

---

## D11 — Backup code verification tries every unconsumed code with no early-exit timing signal

**Decision.** Verification iterates the identity's unconsumed codes, verifies each with
the high-entropy Argon2id profile, and completes the same number of verifications whether
or not a match is found. Consumption of the matched code and the failure-counter update
happen in the same transaction as the verdict, under `FOR UPDATE` on the code rows.

**Rationale.** Two separate problems, one mechanism. Early exit on the first match makes
the response time proportional to the matched code's position in the set, which is a
usable oracle over a 10-element space. And two concurrent recoveries presenting the same
last unconsumed code must produce exactly one success — the row lock is what delivers
`spec.md`'s "two recoveries consume the same last remaining backup code in the same
instant" edge case.

Ten reduced-profile verifications is the cost, bounded and deliberate. FR-031's count of
ten is what keeps that bound small; a set of 100 would make this decision untenable and is
one more reason the count belongs in the spec.

---

## D12 — Twelve audit actions, written in-transaction, attributed to no tenant where none exists

**Decision.** FR-042's twelve actions extend the existing vocabulary under `001`'s
mechanism, written inside the same transaction as the state change — inside the
`SECURITY DEFINER` functions where that is where the change happens. Authentication events
are recorded with `tenant_id NULL`.

**Rationale.** `audit_event.tenant_id` is already nullable and `002`'s
`accept_invitation()` already writes tenant-less entries for refused acceptances, so FR-044
needs no new mechanism — only the discipline of using the existing one. A sign-in genuinely
has no tenant: it precedes the naming of one, and attributing it to a guess would put one
firm's log entries about a person who holds memberships in two.

`0018_lc_app_audit_action_restriction.sql` restricts which actions `lc_app` may write, so
the twelve new actions must be added to `lc_auth`'s permitted set rather than assumed
writable — a migration, not an application change.

**Open, carried from 002's plan.** `002`'s own open items asked whether `mfa_not_enrolled`
should be audited, and left it as no, noting slice 003 might want its own vocabulary. This
plan agrees: `mfa_not_enrolled` stays unaudited as a precondition failure by a legitimate
member, while *enrollment* events are audited. The distinction is between a refusal and a
change of state.

---

## Constitution items touching this slice, not resolvable here

| Item | Effect on this slice |
|---|---|
| **v1.5.0 is uncommitted in `main`** | Every citation in `spec.md` and this document is against the working tree. Recorded as the first Approval Checklist item on `spec.md`; blocks approval, not `/speckit-tasks`. |
| `[PENDING]` scope of the AWS account blockage | Decided the shape of D5. If account-wide, the production `KeyProvider` needs a non-AWS implementation, which is a config change under D5's port rather than a redesign. |
| `[PENDING]` PAC selection | No effect here. The key-access audit standard D5 inherits is defined; the PAC vendor is not, and this slice touches no PAC credential. |
| Technical Debt 1 — not phishing-resistant | Restated as a Named Risk in `spec.md`. TOTP is phishable by relay and D2/D8 do not change that. Passkeys are item 10 and a later build. |
| Technical Debt 6 — email change conflict | D9 keeps it tractable by refusing to key identity on email. Not closed here. |
| Technical Debt 8, 10, 11 | The three constructions this slice owns. SC-029 requires each covered blockingly and individually. |
| Step-up MFA (`005`) | Gates standalone backup-code re-issuance only (FR-032), a fifth capability alongside the four `002` already withholds. Recovery-path re-issuance ships. |
