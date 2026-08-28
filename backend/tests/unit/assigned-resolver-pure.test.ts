/**
 * T020 — 006/FR-013, Decision 2, research.md D1. The resolver's branches that need no
 * database, exercised without one.
 *
 * Three of the four paths through `AssignedScopeResolver.resolve()` never touch Postgres:
 * the `MP`/`SA` short-circuit returns `true` before any query, and two fail-closed guards
 * return `false` before any query. Only the fourth — a scoped archetype with a real target
 * — needs a transaction, and that path belongs to the integration suite.
 *
 * Testing them here rather than only there is deliberate: the whole point of Decision 2's
 * mechanism argument is that the `MP`/`SA` exemption is *three lines inside the resolver*
 * rather than a branch in `decide()`. A test that has to spin up Testcontainers to assert
 * that would obscure how small it is, and the resolver's 100% coverage bar
 * (vitest.config.ts, T004) is cheaper to hold with these three cases covered here.
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

  describe('Decision 2 — MP and SA satisfy the resolver unconditionally', () => {
    // The exemption is implemented HERE, inside the one resolver, and not as a second
    // scope kind or a branch in `decide()`. That is the whole of Decision 2's mechanism
    // argument: `AuthorizationInterceptor` asks one question, not two.
    for (const archetype of ['MP', 'SA'] as const) {
      it(`${archetype} resolves true with no assignment row and no query`, async () => {
        const granted = await resolver.resolve(
          request({ subject: archetype, principal: principal(archetype) }),
        );
        expect(granted).toBe(true);
      });

      it(`${archetype} resolves true even with no target named at all`, async () => {
        // Reached before the `targetId` guard, deliberately: a partner's reach does not
        // depend on which case was named, so the short-circuit must come first. If this
        // ever regressed to running after the guard, `MP` would be refused on any route
        // that forgot `@ScopeTarget` — a silent, plausible-looking 404.
        const granted = await resolver.resolve(
          request({ subject: archetype, principal: principal(archetype), targetId: null }),
        );
        expect(granted).toBe(true);
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
