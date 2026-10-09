/**
 * T020 — 006/FR-013, Decision 2, research.md D1. The resolver's branches that need no
 * database, exercised without one.
 *
 * The fail-closed guards — no principal, no target named, no membership — return `false`
 * before any query, so they are asserted here without a database. The two paths that query —
 * MP/SA (does the matter exist in the firm?) and every other archetype (is there a live
 * assignment?) — need a transaction and belong to the integration suite
 * (`assigned-scope-resolver.test.ts`, `assigned-scope-isolation.test.ts`).
 *
 * Amended by `fix-cross-tenant-fk-oracle`: MP/SA used to short-circuit to `true` before any
 * query and before the target guard. That is what let a write path that forgot its own lookup
 * reach a foreign-key check that ignores RLS. The exemption is now from assignment only.
 */
import { describe, expect, it } from 'vitest';
import { AssignedScopeResolver } from '../../src/modules/case-core/assigned-scope.resolver';
import type { ScopeRequest } from '../../src/common/authz/scope';
import type { ActivePrincipal, Archetype } from '../../src/common/tenant/principal';

const TENANT = '00000000-0000-4000-8000-0000000000a1';
const CASE = '00000000-0000-4000-8000-0000000000c1';

function principal(archetype: Archetype): ActivePrincipal {
  return {
    identityId: '00000000-0000-4000-8000-000000000001',
    membershipId: '00000000-0000-4000-8000-0000000000m1'.replace('m', 'b'),
    tenantId: TENANT,
    archetype,
    plan: null,
  };
}

function request(overrides: Partial<ScopeRequest> = {}): ScopeRequest {
  return {
    subject: 'AA',
    capability: 'case.read',
    principal: principal('AA'),
    identityId: principal('AA').identityId,
    targetTenantId: TENANT,
    targetId: CASE,
    ...overrides,
  };
}

describe('AssignedScopeResolver — the branches that need no database', () => {
  const resolver = new AssignedScopeResolver();

  it('declares the assigned kind, which is what registers it against the right slot', () => {
    expect(resolver.kind).toBe('assigned');
  });

  describe('Decision 2 — MP and SA are exempt from assignment, never from tenancy', () => {
    // The exemption is implemented HERE, inside the one resolver, and not as a second
    // scope kind or a branch in `decide()`. That is the whole of Decision 2's mechanism
    // argument: `AuthorizationInterceptor` asks one question, not two.
    //
    // What the exemption grants — every matter OF THE FIRM, with no assignment row — needs the
    // database to say which matters are the firm's, so it is asserted against real rows in
    // `tests/integration/assigned-scope-isolation.test.ts` (own unstaffed matter: true; another
    // firm's real matter and a made-up one: false). What can be asserted here is the guard.
    for (const archetype of ['MP', 'SA'] as const) {
      it(`${archetype} is refused, before any query, when the route named no target`, async () => {
        // This used to be `true`: the exemption ran before the target guard, so an MP's reach
        // "did not depend on which case was named" — and the resolver never checked the named
        // case belonged to the firm. That is the cross-tenant oracle 009 found. A forgotten
        // `@ScopeTarget` is now a build failure (`scope-target-declared.test.ts`), so failing
        // closed here costs nothing. No query: `currentTx()` would throw outside a context.
        const granted = await resolver.resolve(
          request({ subject: archetype, principal: principal(archetype), targetId: null }),
        );
        expect(granted).toBe(false);
      });
    }

    it('does not extend the exemption to any other internal archetype', async () => {
      // These four are the archetypes the ethical-wall argument actually protects
      // (spec.md Decision 2, "What survives the trade-off"). If one of them ever
      // short-circuited, the wall would be gone for most of a firm's headcount and
      // nothing else in the suite would notice — every one of them would simply start
      // seeing more cases.
      //
      // They reach the query path, so with no tenant context active `currentTx()` throws
      // rather than answering. Asserting the throw is asserting they did NOT short-circuit.
      for (const archetype of ['AA', 'PL', 'CM', 'BM'] as const) {
        await expect(
          resolver.resolve(request({ subject: archetype, principal: principal(archetype) })),
        ).rejects.toThrow(/no tenant context/i);
      }
    });
  });

  describe('fail-closed guards', () => {
    it('refuses when no principal was resolved', async () => {
      expect(await resolver.resolve(request({ principal: null }))).toBe(false);
    });

    it('refuses when the route named no target', async () => {
      // This is the state a route that declares `assigned` scope and forgets
      // `@ScopeTarget` produces. Refusing is the safe direction; the build gate in
      // tests/contract/scope-target-declared.test.ts is what stops it reaching production,
      // because at runtime this refusal is indistinguishable from a correct one (FR-016).
      expect(await resolver.resolve(request({ targetId: null }))).toBe(false);
    });

    it('refuses a principal with no membership id', async () => {
      // Not reachable through `resolvePrincipal`, which always sets one. Covered because
      // the alternative — trusting it — would mean comparing `undefined` against a uuid
      // column and getting whatever Postgres decides that means.
      const withoutMembership = { ...principal('AA'), membershipId: '' } as ActivePrincipal;
      expect(await resolver.resolve(request({ principal: withoutMembership }))).toBe(false);
    });
  });
});
