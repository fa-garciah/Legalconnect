/**
 * T021 — the `assigned` scope resolver. 006/FR-013, research.md D1.
 *
 * **This is the file three earlier slices deferred to by name.** 004 shipped
 * `ScopeResolverPort` with `assigned` declared as a kind and no implementation behind it,
 * deliberately: `resolverFor('assigned')` returned `undefined`, `decide()` treated that as
 * a refusal rather than a default permit, and the whole mechanism sat fail-closed and
 * unreachable (004/research.md D3, US5 scenario 6). 017 added three capabilities, all
 * `tenant`-scoped, and left it that way. 016a built a refusal classifier whose `scope`
 * bucket nothing could produce. This file is what makes the kind real.
 *
 * It answers one question: does the caller hold a live assignment to this case?
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ScopeKind } from '../../common/authz/capability';
import type { ScopeRequest, ScopeResolver } from '../../common/authz/scope';
import { currentTx } from '../../common/tenant/middleware';

/**
 * Not registered by this file — `CaseCoreModule.onModuleInit` calls
 * `registerScopeResolver(this)`, which is the extension seam 004 exported for exactly
 * this purpose (`common/authz/scope.ts`, "a downstream slice's own module constructs its
 * resolver through Nest DI and calls `registerScopeResolver(this)` from `onModuleInit` —
 * no file here is edited to do it"). `scope.ts` is untouched by this slice.
 */
@Injectable()
export class AssignedScopeResolver implements ScopeResolver {
  readonly kind: ScopeKind = 'assigned';

  async resolve(request: ScopeRequest): Promise<boolean> {
    const principal = request.principal;

    // Fail closed. Unreachable on a tenant-scoped route, where `TenantContextInterceptor`
    // has already resolved a principal or refused — but a resolver that assumed one would
    // be assuming something about a caller it is meant to be deciding about.
    if (!principal) return false;

    // Decision 2 — BEFORE any query, and before the target guard below.
    //
    // A managing partner who cannot see the firm's own caseload without being individually
    // assigned to every matter is not a workable product; `SA` needs it for the same
    // operational reason 004 already grants `SA` tenant-wide reads elsewhere.
    //
    // The order matters. Short-circuiting ahead of the `targetId` guard means a partner's
    // reach does not depend on which case was named — if this ran after the guard, `MP`
    // would be refused on any route that forgot `@ScopeTarget`, and that refusal is
    // byte-identical to a legitimate one (FR-016), so nobody would find out from the
    // response.
    //
    // **The cost, which spec.md Decision 2 names rather than hides:** this trades away
    // ethical-wall enforcement against the firm's own partners. A screened `MP` can open
    // any matter, and the audit trail records that they did rather than preventing it. The
    // wall still holds against `AA`, `PL` and `CM` — most of a firm's headcount — and
    // FR-016's opacity means those archetypes learn nothing about the existence of matters
    // they are screened from.
    if (principal.archetype === 'MP' || principal.archetype === 'SA') return true;

    // Fail closed. `null` here means the route declared `assigned` scope and no
    // `@ScopeTarget` — a bug that `tests/contract/scope-target-declared.test.ts` fails the
    // build for, precisely because at runtime it is indistinguishable from a correct
    // refusal.
    if (!request.targetId) return false;
    if (!principal.membershipId) return false;

    // No `tenant_id` predicate, and its absence is load-bearing rather than an oversight.
    //
    // `currentTx()` is the transaction `TenantContextInterceptor` already opened, on which
    // `app.tenant_id` is set. `case_assignment`'s RLS policy applies it. Handed another
    // tenant's case id, this sub-select matches zero rows, the resolver answers `false`,
    // and `refusalToHttp` maps that to the same 404 a nonexistent case produces — so
    // cross-tenant existence stays uninferable. Writing the predicate here would be
    // harmless but would suggest RLS were not already doing it, which is worse.
    //
    // Backed by `case_assignment_live_unique`, the partial index over
    // `(case_id, membership_id) WHERE unassigned_at IS NULL` — so this holds only live
    // assignments and stays small as history accumulates.
    //
    // **No cache, and none needed.** FR-011 requires unassignment to take effect on the
    // very next request. That is not a caching policy this file implements; it falls out
    // of running the query inside the request's own transaction. There is no session
    // object to invalidate because nothing is stored between requests. 004 refused the
    // same shortcut for entitlements, for the same reason (004/research.md D7).
    const result = await currentTx().execute<{ ok: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM case_assignment
         WHERE case_id       = ${request.targetId}::uuid
           AND membership_id = ${principal.membershipId}::uuid
           AND unassigned_at IS NULL
      ) AS ok
    `);

    // Deliberately does NOT check whether the case exists first. "No such case" and "not
    // your case" both produce zero rows and the same `false`. Distinguishing them
    // internally would create two code paths whose timing differs, which is the side
    // channel FR-016 exists to close — a 404 that arrives faster for a nonexistent case
    // than for a real one discloses exactly what the 404 was chosen to hide.
    return result.rows[0]?.ok === true;
  }
}
