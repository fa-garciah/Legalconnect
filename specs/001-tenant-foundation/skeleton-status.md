# Walking Skeleton Status

**Feature**: `001-tenant-foundation` | **Checked**: 2026-08-20

The constitution's *Technology Constraints → Walking Skeleton* section names six
items required before Fase 1. `plan.md` and `quickstart.md` said this slice would
contribute items 2, 3 and *part of* 6. Having now finished all five user stories
and actually run the verification that item 6 requires, the real picture is
slightly better than that in one place and needs one honest correction in
another — both recorded below rather than left to the next reader to discover.

## Item-by-item

### 1. Login against the IdP with MFA end-to-end — NOT this slice

Owned by slices 002 (identity), 003 (sessions) and 005 (MFA), as planned. This
slice authenticates nothing — `resolvePrincipal` takes an already-authenticated
identity reference, per contracts/tenant-context.md, and every test supplies one
through `backend/tests/fixtures/identity.ts` rather than a real login.

### 2. Tenant middleware + `SET LOCAL app.tenant_id` + one table with active RLS — ✅ STANDING

Fully delivered and proven, not merely present:

- `TenantContextInterceptor` (`backend/src/common/tenant/middleware.ts`) resolves
  identity + named tenant into a verified live membership, then activates exactly
  one tenant per transaction.
- `tenant` and `audit_event` both carry `ENABLE`+`FORCE ROW LEVEL SECURITY` with
  the null-safe predicate, `backend/drizzle/0005_rls.sql`.
- Proven by `npm run test:isolation` (10 files, 53 tests, all green) and
  `npm run verify:role` (the connected role is not superuser, owns nothing, lacks
  `BYPASSRLS`).

### 3. Audit interceptor writing to the append-only table — ✅ STANDING

`AuditInterceptor` (`backend/src/common/audit/interceptor.ts`) appends inside the
mutation's own transaction for every `@Audited` route; the application role holds
`INSERT`+`SELECT` on `audit_event` and neither `UPDATE` nor `DELETE`
(`backend/drizzle/0006_grants.sql`). All seven actions in the FR-014 vocabulary
are exercised end to end — `backend/tests/integration/audit-fields.test.ts`,
`audit-immutability.test.ts`, `audit-atomicity.test.ts`.

### 4. Permission guard and entitlement guard operational — PARTIAL, narrower than "part of 6" implied

`quickstart.md`'s "what this slice does not deliver" listed item 4 entirely
under slices 002–004. That undersold what actually got built: `GET /audit/events`
(US4) needed *some* authorized-role check now, so `backend/src/common/tenant/middleware.ts`
enforces `@RequireArchetypes('SA')` for real, against a real resolved principal —
tested in `backend/tests/contract/audit-query-authz.test.ts`. That is a genuine,
if narrow, permission guard, not a stub.

**What is still missing, honestly:**
- Only `SA` is ever checked. The full archetype matrix (`MP`, `AA`, `PL`, `CM`,
  `BM`, `IC`, `CB`, `EL` and what each may do) does not exist — that is slice
  004's job, per plan.md's open item 1.
- **No entitlement guard exists at all.** `plan.entitlements` is a real column,
  written and read back correctly, but nothing anywhere checks it before
  allowing an action. `backend/src/modules/plan/README.md` says this outright:
  enforcement of both limits and entitlements is slice 004's job.
- **A genuine bug was found and fixed while finishing this item**: the original
  shell was a NestJS `Guard` (`PermissionGuard`), which cannot work — Guards run
  before Interceptors in Nest's request lifecycle, and the principal it needed to
  check is only ever set by an Interceptor. It would have refused every
  archetype-gated route unconditionally once a real check was added, regardless
  of the caller's actual archetype. No test had exercised a Guard and this
  Interceptor together until US4 needed the check to actually work. Fixed by
  moving the check into `TenantContextInterceptor`; `PermissionGuard` itself was
  removed as dead weight once its `canActivate` had nothing left to decide. See
  `backend/src/common/permissions/guard.ts` and `quickstart-results.md`.

### 5. Cross-tenant leak test green — ✅ STANDING (today, on fixtures)

`quickstart.md` listed this under slices 002–004 too, presumably because a
"real" leak test implies real identities. In practice the leak suite does not
need them: it is fully green today, driven by the fixtures at
`backend/tests/fixtures/identity.ts`, which are written against the exact
`Identity`/`Membership` shape FR-021 already decided. Slice 002 replaces the
fixture-backed `MEMBERSHIP_PORT` adapter with a database-backed one behind the
same port (`backend/src/common/tenant/membership.ts` says as much); nothing
above that seam should need to change, and this suite is what will prove it
didn't.

### 6. Complete CI pipeline: secret scanning, dependency scanning, blocking coverage, RLS verification — ✅ NOW FULLY STANDING

All four jobs exist in `.github/workflows/ci.yml` (T033). The qualifier "part
of" attached to this item was accurate until T105: blocking coverage
(`src/common/tenant/**` and `src/common/audit/**` at 100%, per
`backend/vitest.config.ts`) had never actually been run and checked before this
pass. Running it surfaced real gaps — not flaky tests, but code paths (an
interceptor refusal branch, several pure-function branches, one now-deleted
dead function) that had simply never executed under any test. All are closed;
`npm test -- --coverage` now exits 0. See `quickstart-results.md` for the full
before/after and the two genuine defects that surfaced along the way.

## Gap list for slices 002–004

Handed off explicitly rather than left implicit in code comments alone:

**Slice 002 (identity)**
- Build real `identity` and `membership` tables matching FR-021's shape.
- Implement a database-backed `MembershipPort` and swap it in behind the
  existing seam (`MEMBERSHIP_PORT` in `backend/src/common/tenant/membership.ts`)
  — nothing above that interface should need to change.
- Re-run `npm run test:isolation` against the real adapter as the acceptance
  bar; it is written to be adapter-agnostic already.

**Slice 003 (sessions, MFA)**
- Walking skeleton item 1 (login + MFA end-to-end).
- Revoking a live session when its tenant is deactivated — research.md D13
  flags this as open and explicitly deferred here, not solved.
- Deciding whether and how to expose the platform administration surface
  beyond loopback (`backend/src/main.ts` refuses to bind anywhere else and warns
  loudly if forced) — this cannot happen before session/MFA exists.

**Slice 004 (permissions, entitlements, plan enforcement)**
- The full archetype-to-action matrix behind `RequireArchetypes` — today only
  `SA` is ever granted anything.
- An entitlement guard reading `plan.entitlements` before allowing a
  feature-gated action — the column exists, nothing reads it yet.
- Real usage tracking to replace `change-plan.service.ts`'s `exceededLimits`
  comparison, which today compares the target tier's limits against the
  *current tier's own ceiling* (there is no business data in this slice to
  measure real consumption against) — see `backend/src/modules/plan/README.md`.
- Resolving plan.md's still-open item 2: how much actor detail a targeted firm
  may see in a `tenant.cross_access_attempted` entry (a counsel decision, not an
  engineering one — the mechanism supports either answer today).
