/**
 * T054 — US5: the scope port, proved fail-closed with a stub, before its first real
 * consumer exists. FR-014, FR-016, FR-017.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { decide, type DecisionInput } from '../../src/common/authz/decide';
import { CAPABILITIES, type CapabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { MATRIX } from '../../src/common/authz/matrix';
import { registerScopeResolver, unregisterScopeResolver, type ScopeResolver } from '../../src/common/authz/scope';

const ASSIGNED_ID = 'test.assigned_probe' as CapabilityId;

function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    subject: 'AA',
    capability: ASSIGNED_ID,
    mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
    scope: {
      subject: 'AA',
      capability: ASSIGNED_ID,
      principal: { identityId: 'i', membershipId: 'm', tenantId: 't', archetype: 'AA' },
      identityId: 'i',
      targetTenantId: 't',
      targetId: 'case-1',
    },
    plan: null,
    ...overrides,
  };
}

describe('the assigned scope port', () => {
  beforeAll(() => {
    (CAPABILITIES as Record<string, CapabilityDef>)[ASSIGNED_ID] = { scope: 'assigned' };
    (MATRIX as unknown as Record<string, Set<string>>)[ASSIGNED_ID] = new Set(['AA']);
  });

  afterAll(() => {
    delete (CAPABILITIES as Record<string, CapabilityDef>)[ASSIGNED_ID];
    delete (MATRIX as unknown as Record<string, Set<string>>)[ASSIGNED_ID];
  });

  it('with the resolver unregistered, an assigned capability is refused and never permitted (US5 scenario 6)', async () => {
    const decision = await decide(baseInput());
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('scope');
  });

  describe('with a stub resolver registered', () => {
    let stub: ScopeResolver & { answer: boolean };

    afterEach(() => {
      unregisterScopeResolver('assigned');
    });

    it('the outcome tracks the resolver, not the archetype', async () => {
      stub = { kind: 'assigned', answer: true, resolve: async () => stub.answer };
      registerScopeResolver(stub);

      const permitted = await decide(baseInput());
      expect(permitted.permitted).toBe(true);

      stub.answer = false;
      const refused = await decide(baseInput());
      expect(refused.permitted).toBe(false);
      if (!refused.permitted) expect(refused.reason).toBe('scope');
    });

    it('a caller-supplied claim of assignment is ignored — scope is resolved from stored relationships, not from the request (FR-014)', async () => {
      let receivedTargetId: string | null = null;
      registerScopeResolver({
        kind: 'assigned',
        resolve: async (request) => {
          receivedTargetId = request.targetId;
          // Answers from ITS OWN notion of assignment, never from a caller-supplied
          // flag — there is no such flag anywhere in ScopeRequest to honour.
          return request.targetId === 'the-actual-assigned-case';
        },
      });

      const decision = await decide(baseInput({ scope: { ...baseInput().scope, targetId: 'a-different-case' } }));
      expect(decision.permitted).toBe(false);
      expect(receivedTargetId).toBe('a-different-case');
    });

    it('losing an assignment governs the next request with no grace period', async () => {
      let assigned = true;
      registerScopeResolver({ kind: 'assigned', resolve: async () => assigned });

      expect((await decide(baseInput())).permitted).toBe(true);
      assigned = false;
      expect((await decide(baseInput())).permitted).toBe(false);
    });

    it("the Decision's reason is scope, distinguishable from permission and entitlement", async () => {
      registerScopeResolver({ kind: 'assigned', resolve: async () => false });
      const decision = await decide(baseInput());
      expect(decision.permitted).toBe(false);
      if (!decision.permitted) {
        expect(decision.reason).toBe('scope');
        expect(decision.reason).not.toBe('permission');
        expect(decision.reason).not.toBe('entitlement');
      }
    });
  });

  it('a self-scope capability targeting another person\'s record is refused on scope', async () => {
    const decision = await decide(
      baseInput({
        capability: 'membership.read_own',
        scope: {
          subject: 'AA',
          capability: 'membership.read_own',
          principal: null,
          identityId: 'caller-identity',
          targetTenantId: null,
          targetId: 'someone-elses-identity',
        },
      }),
    );
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('scope');
  });
});
