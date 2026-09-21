# Phase 0 — Research: Session Lifecycle

**Feature**: `005-session-lifecycle` | **Date**: 2026-09-21
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Constitution**: v1.5.0

Every decision below was taken against `backend/src` and `backend/drizzle` as `003` and `004` shipped
them, not against the spec's prose alone. `003/FR-038` explicitly deferred this slice's four
mechanisms into columns and grants already in place; this document is about how those mechanisms
attach to what is actually there.

---

## D1 — Idle and absolute state live on `session` itself, as two new columns, not a new entity

**Decision.** Two columns on `session`:

- `last_seen_at timestamptz NOT NULL DEFAULT now()` — idle clock.
- `family_created_at timestamptz NOT NULL DEFAULT now()` — absolute clock.

**Why this is the one non-obvious fact this whole slice turns on.** `session` rows are **not**
long-lived. `rotate_refresh()` (`0034_session_and_refresh.sql:225-229`) inserts a **new** `session`
row on every refresh-token rotation — a fresh `id`, a fresh `created_at`, a fresh 15-minute
`expires_at` — while `refresh_token.family_id` is the only thing that stays constant across what a
person perceives as one continuous sign-in. A naive absolute-limit check reading `session.created_at`
would therefore reset every ~15 minutes as long as the person keeps using the app — the opposite of
"regardless of activity" (FR-008). The absolute clock has to be anchored to the **family's** origin,
not any individual row's.

**Why a column, not a join to the family's root row.** The family's origin is technically derivable
without a new column — `SELECT created_at FROM refresh_token WHERE family_id = X AND parent_id IS
NULL` — but that is a join on every single request, for a value that is fixed for the family's entire
life. `family_created_at` is copied forward explicitly at every rotation
(`rotate_refresh()`'s `INSERT INTO session` gains `family_created_at` in its column list, copied from
`s.family_created_at` alongside the columns it already copies) so every row carries its own answer
with no join, consistent with `003`'s existing style of denormalizing rather than joining on the
per-request path (`session.access_digest` itself is exactly this pattern already).

**Why `last_seen_at` does *not* need the same family-wide carry-forward.** A rotation is itself
activity — the person is still using the session, that's why a new access token was minted — so
resetting `last_seen_at = now()` (the column's own `DEFAULT`) on the fresh row at rotation time is
correct, not a bug. `mintSession()` (`session.port.ts:64-99`) needs no special handling either: the
first row of a family sets both columns to `now()` via their defaults, which is exactly its origin.

**Alternative rejected.** A `refresh_token_family` table holding one row per family with its own
`created_at`/`last_seen_at`. Rejected because it adds a table and a join for state that fits on the
row already being read on every request, and because `refresh_token` already carries `family_id` as
the grouping key — a second table duplicates it rather than using it.

---

## D2 — The write path is a *new*, narrow function, called only after the limit check passes

**Decision.** `resolve_session()` (`0034_session_and_refresh.sql:99-114`) stays **read-only** and
gains two more returned columns, `last_seen_at` and `family_created_at`, alongside the `id` it does
not currently return (`session.guard.ts` today discards everything but `identity_id`). A **second**,
new function, `touch_session(p_session_id uuid)`, does the write:

```sql
UPDATE session SET last_seen_at = now()
WHERE id = p_session_id AND revoked_at IS NULL;
```

`touch_session()` is called **once the idle/absolute check has already passed**, never before it.

**Why the ordering is the whole point.** If `resolve_session()` itself stamped `last_seen_at = now()`
unconditionally on every call — the natural-looking first draft — an idle-expired session would never
actually expire: every presentation that *should* be refused would also refresh the very clock being
checked, and the idle limit would degrade into "refused only if nobody ever retries," which is not a
limit at all. The write must happen strictly after the refusal decision, on the success path only.
This is the same shape `refresh_token.used_at` already uses (`rotate_refresh()` marks used **after**
deciding rotate-vs-reuse, never before) — the codebase already has this discipline, this slice reuses
it rather than inventing a second one.

**Why `resolve_session()` itself cannot make the refusal decision.** It runs *before*
`app.identity_id` exists (`0034_session_and_refresh.sql:84-87`, unchanged reason) and, more
specifically for this slice, before any tenant is selected — so it has no archetype to check a limit
against (D3). Splitting "read the raw clocks" (in `resolve_session()`, cheap, always safe) from
"decide whether they're within limits for this archetype" (later, once an archetype — or its absence
— is known) is forced by that ordering, not a stylistic choice.

**Grants.** `touch_session()` needs the same shape `resolve_session()` already has: owned by
`lc_auth`, `EXECUTE` granted to `lc_app` too, `REVOKE ALL ... FROM PUBLIC` first. No table grant
changes — `lc_auth` already holds full privilege on `session`.

---

## D3 — Role class comes from `currentPrincipal()`; identity-only requests get the tightest default

**Decision.** No new archetype lookup. `AuthorizationInterceptor.resolveCaller()`
(`authz/interceptor.ts:160-174`) already exposes `principal.archetype`, read fresh from `membership`
on every request with no cache (`tenant/membership.ts:86-131`,
`tests/integration/archetype-change-live.test.ts`). A small pure function,
`roleClassFor(archetype: Archetype | null): 'internal' | 'sa' | 'portal'`, maps it to one of the three
classes; `SESSION_LIMITS: Record<RoleClass, { idleMinutes: number; absoluteMinutes: number }>` holds
the six numbers verbatim from the constitution (D1 in spec.md — a citation, not derived here).

**On a tenant-scoped route** (the overwhelming majority), `principal.archetype` is exactly the class
FR-010 asks for — read live, so an archetype change mid-session (`membership.change_archetype`) is
picked up on the very next request with no extra mechanism, the same way `004`'s entitlement read
already is (`004/research.md` D7).

**On an identity-only route** (004 D8's `self`-scope rows — accept own invitation, read own
memberships — where `principal` is `null` because no tenant is active), `roleClassFor(null)` resolves
to `'sa'`, the tightest of the three. **This is a plan-level default, not a spec requirement**, and is
listed in this plan's Open Items: these two routes are narrow and low-risk by 004's own reasoning
(D8), so erring toward the shortest limits available costs little and avoids inventing a fourth class
for a two-route edge the spec doesn't address by name.

**What this deliberately does not do.** It does not resolve the theoretical case of an identity
holding live memberships of different classes in different tenants by taking "the most restrictive
held anywhere." That reading was considered and rejected: it would make a session's timers depend on
a tenant the current request has nothing to do with, in tension with FR-013's "access to a tenant
not deactivated is unaffected by a different tenant." Reading the class from the tenant *actually
being acted in* — falling back to the tightest class only when there is no tenant in play at all — is
the narrower, request-scoped reading, and is what's implemented.

---

## D4 — Enforcement is one more early check inside `AuthorizationInterceptor`, not a new interceptor

**Decision.** `AuthorizationInterceptor.decideAndProceed()` (`authz/interceptor.ts:47-132`) already
runs unconditionally on every non-auth-surface route and already 404s any route with no declared
`@Capability()` — meaning every session-bearing route this slice needs to reach is already inside its
reach. The idle/absolute check is added as the **first** thing it does after `resolveCaller()`, before
`decide()` runs:

1. Read `request.sessionId`, `request.lastSeenAt`, `request.familyCreatedAt` (new fields on
   `AuthenticatedRequest`, populated by `SessionGuard` from `resolve_session()`'s widened return).
2. Compute the limit from `roleClassFor(caller.principal?.archetype ?? null)` (D3).
3. If `now() - lastSeenAt > idleLimit` or `now() - familyCreatedAt > absoluteLimit`: throw the same
   `UnauthorizedException('No autenticado.')` `SessionGuard` already throws for no-token/unknown-token
   (`session.guard.ts:107,113`) — byte-identical wording, so an idle-expired, absolute-expired, and
   never-existed session are indistinguishable to the caller, extending the property
   `resolve_session()` already gives expired/revoked/unknown (FR-005, FR-011's "no dedicated audit
   entry" — this is not a new refusal class, it's the existing one, reached one more way).
4. Otherwise, call `touch_session(request.sessionId)` (D2) and let `decide()` run as today.

**Why here rather than a new interceptor.** `004/research.md` D2 already made the case for one
mandatory choke point over another interceptor layered on top — a Guard cannot see the principal, and
a second unconditional interceptor duplicates the very traversal `AuthorizationInterceptor` already
performs on all three surfaces. This slice extends that choke point a second time (the first
extension being `004` itself, over `001`/`002`'s original guard-based design) rather than adding a
third layer. It is a cross-slice edit to a `004`-owned file, called out explicitly rather than left
implicit — see plan.md Complexity Tracking.

**Why refusal happens before `decide()`, not after.** An idle/absolute-dead session has nothing left
to decide a permission about. Checking first also means a stale session is never charged against
`decide()`'s entitlement-read cost for nothing.

**Consequence for `SessionGuard`.** It must also change: `canActivate()` currently keeps only
`identity_id` from `resolve_session()`'s row (`session.guard.ts:109-113`); it now keeps `id`,
`last_seen_at` and `family_created_at` too, and `AuthenticatedRequest` (`session.guard.ts:46-50`)
gains three fields to carry them.

---

## D5 — Sign-out is `rotate_refresh()`'s reuse-revocation branch, deliberately triggered

**Decision.** A new function, `sign_out(p_session_id uuid)`, structurally identical to the revocation
`rotate_refresh()` already performs on detected reuse (`0034_session_and_refresh.sql:199-213`):

```sql
CREATE FUNCTION sign_out(p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_family_id uuid;
BEGIN
  SELECT family_id INTO v_family_id FROM refresh_token WHERE session_id = p_session_id LIMIT 1;
  IF v_family_id IS NULL THEN RETURN; END IF;   -- already dead or unknown: idempotent no-op

  UPDATE refresh_token SET revoked_at = now()
    WHERE family_id = v_family_id AND revoked_at IS NULL;
  UPDATE session SET revoked_at = now()
    WHERE revoked_at IS NULL
      AND id IN (SELECT rt.session_id FROM refresh_token rt WHERE rt.family_id = v_family_id);
END $$;
```

**Why it must resolve the *family*, not just the presented row.** FR-003 requires the whole
refresh-token family dead, not only the current access token — and because of D1's finding (a
"session" the person perceives spans many `session` rows over its life), revoking only
`p_session_id` would leave every other row in the same family, and their still-valid refresh tokens,
untouched. Finding `family_id` via the *current* session's own `refresh_token` row and fanning out from
there is exactly `rotate_refresh()`'s own reuse-detection logic, reused rather than re-derived.

**Idempotency (FR-005) falls out for free.** An already-revoked or already-expired session's
`refresh_token` row may still exist (rows aren't deleted, only marked), so the lookup still finds
`family_id`, and the two `UPDATE`s' `WHERE revoked_at IS NULL` guards make a second call a genuine
no-op rather than an error — no special-casing needed, no disclosure of which case it was.

**Grants and connection.** Owned by `lc_auth`. `EXECUTE` granted to `lc_auth` only — `POST
/auth/sign-out` is an authentication-module route living in `modules/auth/`, on `lc_auth`'s own
connection, the same reasoning `rotate_refresh()` already documents for why `lc_app` needs no grant on
it at all (`0034_session_and_refresh.sql:262-265`).

**Audit.** `sign-out.service.ts` writes one `session.signed_out` entry (D8) inside the same
transaction as the `sign_out()` call, identifying the identity (FR-006) — the existing
in-transaction-audit pattern (`audit/append.ts:1-11`), not a new one.

---

## D6 — Step-up is a new, short-lived, single-use, database-backed elevation — not a token the caller mints

**Decision.** A new table, `step_up_elevation`, and two new functions.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` |
| `identity_id` | `uuid` | NOT NULL, FK → `identity.id` |
| `capability` | `text` | NOT NULL. One of the five `stepUp: true` capability ids — validated in the application against the `CapabilityId` union, not a DB constraint, matching `004` D1's reasoning that a capability is an application-level fact, never a database table |
| `token_digest` | `text` | NOT NULL UNIQUE. SHA-256 of an opaque high-entropy value, exactly `session.access_digest`'s shape |
| `expires_at` | `timestamptz` | NOT NULL. `now() + 2 minutes` at issuance |
| `consumed_at` | `timestamptz` | NULL until used. Non-null + presented again = refuse |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

`POST /auth/step-up { capability, code }` — a new route in `modules/auth/`, on `lc_auth`'s connection
— verifies `code` by calling the **exact same** `KeyProvider.unwrap()` + `verifyCode()` pair
`sign-in.service.ts:186-190` already uses against `identity_factor`. On success it inserts a
`step_up_elevation` row and returns the opaque token (never the digest). On failure it returns the
same uniform-refusal shape `003` already uses for a failed ordinary challenge (FR-020) — this route
adds no new refusal vocabulary for a wrong code, only for what happens next (D6, refusal table below).
Either way, exactly one `stepup.verified` / `stepup.failed` audit entry is written here (FR-021,
D8) — this is the "verification," in FR-021's sense; consuming the elevation later is not a second
verification event.

The gated endpoint, inside `AuthorizationInterceptor`, when `def.stepUp === true` and `decide()` has
already allowed the request (Edge Case: permission before step-up): reads an `X-Step-Up-Token` header,
digests it, and calls:

```sql
CREATE FUNCTION consume_step_up(p_token_digest text, p_identity_id uuid, p_capability text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE step_up_elevation
  SET consumed_at = now()
  WHERE token_digest = p_token_digest AND identity_id = p_identity_id
    AND capability = p_capability AND consumed_at IS NULL AND expires_at > now()
  RETURNING true;
$$;
```

owned by `lc_auth`, `EXECUTE` granted to `lc_app` (the gated endpoint runs on the ordinary connection,
unlike step-up's own issuance route) — the same two-function shape `resolve_session()`/`touch_session()`
already established in D2. Absent, expired, wrong-capability, or already-consumed all collapse to the
same `false`, and the interceptor refuses with a new, deliberately distinguishable 403,
`step_up_required` — distinguishable from a wrong-code refusal on purpose, because "you must complete
step-up" discloses nothing the caller doesn't already know (ordinary permission already passed), while
"your code was wrong" is the one thing FR-020 forbids disclosing anywhere else.

**Why not a signed short-lived token.** The constitution prohibits a stateless credential as sole
authority (`003/research.md` D2, restated in `session.md` FR-034/FR-038 lineage); a step-up elevation
*is* a credential — "this identity recently proved possession of its second factor for this one
operation" — and the same prohibition applies to it verbatim. A DB-backed, single-use, revocable-by-
construction row is the only shape consistent with what `003` already committed to.

**Why single-use and two minutes, not session-scoped or longer.** FR-019 requires scope to "one
sensitive operation... or a short, bounded window" and User Story 2 scenario 5 requires a second,
different gated operation to demand its own fresh verification. Two minutes is long enough for one
HTTP retry round-trip after the client receives the `step_up_required` refusal and collects a fresh
code from the person; it is deliberately not tied to TOTP's own 90-second acceptance window
(`totp.ts`), because that window governs code-to-secret matching, a different clock than
token-to-use freedom.

**Rejected: reusing `identity_factor`'s existing lockout counters for step-up failures.** A wrong
step-up code is a failed challenge like any other and could, in principle, count toward the same
5-attempt lockout `003/FR-021` already enforces. This is **not implemented** here — `verifyCode()`'s
lockout bookkeeping lives inside `sign-in.service.ts`/`enrollment.service.ts`, not inside `totp.ts`
itself, so reusing it would mean the new step-up route reads and writes `identity_factor`'s lockout
columns directly, widening its own reach into a table it otherwise only reads through
`KeyProvider.unwrap()`. Left as a non-blocking Open Item rather than silently doing nothing: a person
could otherwise attempt an unlimited number of step-up codes with no lockout, which `003`'s ordinary
sign-in challenge does not permit.

---

## D7 — Tenant deactivation (spec's D3) needs no new code — confirmed, not assumed

**Decision.** No file changes for User Story 4 beyond the acceptance tests themselves.
`tenant/resolve.ts::tenantIsActive()` (`tenant/resolve.ts:82-90`) already reads `tenant.status` fresh
from the database on every single request, with no cache, and `resolvePrincipal()` already calls it
after confirming a live membership — refusing with the existing generic 404
(`tenant/refusals.ts:35-48`), byte-identical to "tenant doesn't exist," which is what FR-012's
"immediately, no grace period" and FR-015's "no additional audit entry" already describe as already
true rather than as something to build.

**What this confirms, concretely, that spec.md's D3 only argued for.** `003/FR-037`'s "session carries
no tenant" holds in the schema exactly as claimed (`0034_session_and_refresh.sql:17-23` — no
`tenant_id` column on `session` or `refresh_token`), and `001`'s refusal-at-activation is genuinely
per-request, not cached — the two facts D3's Option A depended on. Both check out. This is the one
item in this research document that changes nothing about the codebase; it is here so that fact is a
verified plan-time finding rather than an unverified spec-time assumption carried forward unexamined.

**One real gap found, non-blocking.** `REFUSALS_THAT_AUDIT` (`tenant/principal.ts:68-71`) does not
include `tenant_deactivated` — consistent with FR-015 ("the existing `tenant.deactivated` entry...
is sufficient," referring to the entry `001` writes at the moment of deactivation itself, not at each
later refused request). Confirmed intentional, not an oversight to fix here.

---

## D8 — Two new audit actions, added to the exhaustive registry the existing discipline already requires

**Decision.** `common/audit/actions.ts`'s `AUDIT_ACTIONS` (`actions.ts:9-115`) gains:

- `session.signed_out` — FR-006, written by D5's sign-out route.
- `stepup.verified` / `stepup.failed` — FR-021, written by D6's `/auth/step-up` route.

`TARGET_ENTITY_BY_ACTION` (`actions.ts:139-215`) is an exhaustive `Record`, so each addition is a
compile error until its target entity is named — the same self-enforcing mechanism `004` D1 relies on
for capability rows, applied here to actions instead. No `session.expired` or `tenant.session_revoked`
action is added: FR-011 and FR-015 both state, as a requirement rather than an oversight, that passive
idle/absolute expiry and tenant-deactivation's effect on a session get no dedicated entry of their own.

---

## D9 — `invitation.issue_seed`'s step-up gate is deferred by non-exposure, confirmed during implementation

**Found during implementation, not anticipated by D2 or by spec.md.** `invitation.issue_seed` is one
of the five `stepUp: true` capabilities (D2/spec.md is a citation of the registry as it stood at
planning time), but it is reachable only from the platform-admin surface
(`@PlatformSurface()`, `seed.controller.ts`), which authenticates nothing today — `PO` is a vendor
role, not a tenant membership, and holds no session for a step-up elevation to attach to
(`004/research.md` D9: "PO is a property of the surface, not of a claim"). Enforcing the gate
unconditionally would make this capability permanently unreachable, a regression to an
already-shipped `002` platform flow.

**Decision, confirmed 2026-09-21.** The gate (`AuthorizationInterceptor`'s step-up consumption block)
is scoped to callers who hold an identity to elevate; `PO` — and therefore this one capability — falls
outside its reach entirely, exactly as it already falls outside idle/absolute expiry and outside
`SessionGuard` itself. This is not a new kind of exception: it is the same "deferred by non-exposure"
posture the constitution and prior slices already apply to capabilities not yet reachable in
production (`002/research.md` D10; `003/contracts/recovery.md`'s standalone re-issuance).

**Why this is closed rather than left as a silent `if`.** A condition that happens to be true today
(`PO` has no identity) is not the same as a rule that stays true. `capability-declared-everywhere.test.ts`
gained an assertion that **exactly one** `stepUp: true` capability is platform-surfaced today, and
that it is this one. A future capability marked both `stepUp: true` and `@PlatformSurface()` fails
that test immediately — the same decision this note records has to be made again, deliberately,
rather than silently inherited from this slice's exemption.

**New technical debt, recorded rather than solved here.** Whichever future slice network-exposes the
platform-admin surface owns building real `PO` authentication and, if any platform capability still
needs it, step-up for that surface. None of the platform surface's other rows (`data-model.md`'s rows
11–16 in `004`'s numbering) carry `stepUp: true` today, so this is not yet load-bearing — but it will
be the moment one does.

---

## Summary of what changed against the spec draft

Nothing in `spec.md` is contradicted. Two things spec.md left as `plan.md` decisions (per its own
Assumptions section) are resolved here for the first time:

1. **How a step-up verification's state is represented** — a DB-backed, single-use, two-minute
   elevation (D6), not a signed token, not a session-level flag.
2. **What role class governs a session when no tenant is active** — the tightest class, `SA` (D3),
   flagged as a plan-level default rather than a spec-cited fact, in `plan.md` Open Items.

One thing found that spec.md's Edge Cases did not anticipate in this much detail, and is not a
contradiction but is worth naming: **a "session" a person perceives is actually a chain of `session`
rows linked by one `refresh_token.family_id`, not one row with one lifetime** (D1). Every FR in
spec.md written in terms of "the session" (sign-out, idle, absolute, step-up) is satisfied by this
plan's reading of "session" as "the family," which is what `FR-003` already says explicitly for
sign-out and what D1–D2 make load-bearing for idle/absolute too.
