/**
 * T042 — a request tripping multiple reasons returns exactly one, and it is the
 * earliest in `REFUSAL_ORDER`. FR-022, SC-005. Each of the six adjacent pairs is
 * asserted independently so the ordering cannot pass by coincidence.
 *
 * Exercising the `entitlement` branch requires a capability carrying a `tier` and a
 * `limit` key, and none does at launch (plan.md Open Item 4) — so this test injects
 * one temporary synthetic row directly into the shared, mutable `CAPABILITIES`/
 * `MATRIX` runtime objects (a plain JS object at runtime; `as const` is compile-time
 * only), the same "test-local registry" quickstart.md Scenario 1 describes, and
 * removes it afterward.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decide, type DecisionInput } from '../../src/common/authz/decide';
import { CAPABILITIES, type CapabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { MATRIX } from '../../src/common/authz/matrix';

const SYNTHETIC_ID = 'test.ordering_probe' as CapabilityId;
const SYNTHETIC_DEF: CapabilityDef = { scope: 'tenant', tier: 'probe_feature', limit: 'users' };

beforeAll(() => {
  (CAPABILITIES as Record<string, CapabilityDef>)[SYNTHETIC_ID] = SYNTHETIC_DEF;
  (MATRIX as unknown as Record<string, Set<string>>)[SYNTHETIC_ID] = new Set(['SA']);
});

afterAll(() => {
  delete (CAPABILITIES as Record<string, CapabilityDef>)[SYNTHETIC_ID];
  delete (MATRIX as unknown as Record<string, Set<string>>)[SYNTHETIC_ID];
});

const OK_SCOPE: DecisionInput['scope'] = {
  subject: 'SA',
  capability: SYNTHETIC_ID,
  principal: { identityId: 'i', membershipId: 'm', tenantId: 't', archetype: 'SA' },
  identityId: 'i',
  targetTenantId: 't',
  targetId: null,
};

const OK_PLAN = { entitlements: { probe_feature: true }, limits: { users: 100 } };

function input(overrides: Partial<DecisionInput>): DecisionInput {
  return {
    subject: 'SA',
    capability: SYNTHETIC_ID,
    mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
    scope: OK_SCOPE,
    plan: OK_PLAN,
    ...overrides,
  };
}

describe('refusal ordering — six adjacent pairs, independently', () => {
  it('a fully-permitted baseline is permitted (sanity check the fixture itself)', async () => {
    const decision = await decide(input({}));
    expect(decision.permitted).toBe(true);
  });

  it('mfa vs permission: mfa wins', async () => {
    const decision = await decide(input({ subject: 'AA', mfaEnrolledAt: null }));
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('mfa_not_enrolled');
  });

  it('mfa vs scope: mfa wins', async () => {
    const decision = await decide(
      input({ mfaEnrolledAt: null, scope: { ...OK_SCOPE, targetTenantId: 'someone-elses-tenant' } }),
    );
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('mfa_not_enrolled');
  });

  it('mfa vs entitlement: mfa wins', async () => {
    const decision = await decide(
      input({ mfaEnrolledAt: null, plan: { entitlements: { probe_feature: false }, limits: {} } }),
    );
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('mfa_not_enrolled');
  });

  it('permission vs scope: permission wins', async () => {
    const decision = await decide(
      input({ subject: 'AA', scope: { ...OK_SCOPE, targetTenantId: 'someone-elses-tenant' } }),
    );
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('permission');
  });

  it('permission vs entitlement: permission wins', async () => {
    const decision = await decide(
      input({ subject: 'AA', plan: { entitlements: { probe_feature: false }, limits: {} } }),
    );
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('permission');
  });

  it('scope vs entitlement: scope wins', async () => {
    const decision = await decide(
      input({
        scope: { ...OK_SCOPE, targetTenantId: 'someone-elses-tenant' },
        plan: { entitlements: { probe_feature: false }, limits: {} },
      }),
    );
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('scope');
  });

  it('all four reasons tripped at once: mfa_not_enrolled, the earliest, wins', async () => {
    const decision = await decide(
      input({
        subject: 'AA',
        mfaEnrolledAt: null,
        scope: { ...OK_SCOPE, targetTenantId: 'someone-elses-tenant' },
        plan: { entitlements: { probe_feature: false }, limits: {} },
      }),
    );
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('mfa_not_enrolled');
  });
});
