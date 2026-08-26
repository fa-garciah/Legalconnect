/**
 * T018 — US1: the default is closed. FR-002, FR-019, SC-002, US5 scenario 6.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { decide, type DecisionInput } from '../../src/common/authz/decide';
import { SUBJECTS } from '../../src/common/authz/matrix';
import { registerScopeResolver, unregisterScopeResolver } from '../../src/common/authz/scope';
import type { CapabilityId } from '../../src/common/authz/capability';

function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    subject: 'SA',
    capability: 'audit.read_own_tenant',
    mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
    scope: {
      subject: 'SA',
      capability: 'audit.read_own_tenant',
      principal: null,
      identityId: null,
      targetTenantId: null,
      targetId: null,
    },
    plan: null,
    ...overrides,
  };
}

describe('deny by default', () => {
  it('a capability with no matrix row is refused for all 11 subjects — reason permission', async () => {
    // Reaches decide() only via an unsafe cast — CapabilityId is closed at compile
    // time, so no real caller can construct this (quickstart.md Scenario 1). What is
    // under test is the RUNTIME fallback that backs the compile-time guarantee.
    const unregistered = 'nobody.registered_this' as CapabilityId;

    for (const subject of SUBJECTS) {
      const decision = await decide(baseInput({ subject, capability: unregistered }));
      expect(decision.permitted).toBe(false);
      if (!decision.permitted) expect(decision.reason).toBe('permission');
    }
  });

  it('capability: null is refused before any other evaluation', async () => {
    const decision = await decide(
      baseInput({ capability: null, mfaEnrolledAt: null /* would otherwise refuse mfa first */ }),
    );
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('permission');
  });

  describe('a capability whose declared scope kind has no registered resolver', () => {
    afterEach(() => {
      // Restore — this module's registry is shared, mutable, process-wide state.
      registerScopeResolver({ kind: 'tenant', resolve: async (r) => r.principal?.tenantId === r.targetTenantId });
    });

    it('is refused on scope, never permitted, even though permission would otherwise pass', async () => {
      const removed = unregisterScopeResolver('tenant');
      expect(removed).toBeDefined();

      // 'audit.read_own_tenant' is tenant-scoped and SA holds it — permission passes,
      // so this exercises the scope step specifically, not a permission shortcut.
      const decision = await decide(
        baseInput({
          subject: 'SA',
          capability: 'audit.read_own_tenant',
          scope: {
            subject: 'SA',
            capability: 'audit.read_own_tenant',
            principal: { identityId: 'i', membershipId: 'm', tenantId: 't', archetype: 'SA' },
            identityId: 'i',
            targetTenantId: 't',
            targetId: null,
          },
        }),
      );
      expect(decision.permitted).toBe(false);
      if (!decision.permitted) expect(decision.reason).toBe('scope');
    });
  });
});
