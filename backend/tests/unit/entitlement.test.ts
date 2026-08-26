/**
 * T041 — US3: `plan.entitlements` (feature flag) and `plan.limits` (quantitative
 * limit) evaluation, independent of archetype. FR-005, FR-024, SC-008.
 *
 * `def` is passed as a deliberately-cast fixture, the same technique
 * deny-by-default.test.ts uses for an unregistered capability: no capability in the
 * real registry carries a `tier` or `limit` key at launch (plan.md Open Item 4), so
 * this exercises the mechanism's shape rather than any shipped mapping.
 */
import { describe, expect, it } from 'vitest';
import { evaluateEntitlement, type Plan } from '../../src/common/authz/entitlement';

const CAP = 'audit.read_own_tenant' as const;

describe('evaluateEntitlement — feature flag', () => {
  it('refuses when plan.entitlements[tierKey] is not exactly true, independent of archetype', () => {
    const plan: Plan = { entitlements: { audit_log: false }, limits: {} };
    const decision = evaluateEntitlement(CAP, { tier: 'audit_log' }, plan);
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) {
      expect(decision.reason).toBe('entitlement');
      expect(decision.capability).toBe(CAP);
    }
  });

  it('permits when plan.entitlements[tierKey] is true', () => {
    const plan: Plan = { entitlements: { audit_log: true }, limits: {} };
    const decision = evaluateEntitlement(CAP, { tier: 'audit_log' }, plan);
    expect(decision.permitted).toBe(true);
  });

  it('a capability with no tier key is included in every plan — even a null plan', () => {
    expect(evaluateEntitlement(CAP, {}, null).permitted).toBe(true);
    expect(evaluateEntitlement(CAP, {}, { entitlements: {}, limits: {} }).permitted).toBe(true);
  });

  it('a null plan refuses any capability carrying a tier key — fail-closed', () => {
    const decision = evaluateEntitlement(CAP, { tier: 'audit_log' }, null);
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('entitlement');
  });
});

describe('evaluateEntitlement — quantitative limit', () => {
  it('refuses when usage meets the ceiling, and names the limit as { key, value }', () => {
    const plan: Plan = { entitlements: {}, limits: { users: 25 } };
    const decision = evaluateEntitlement(CAP, { limit: 'users' }, plan, { users: 25 });
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) {
      expect(decision.reason).toBe('entitlement');
      expect(decision.limit).toEqual({ key: 'users', value: 25 });
    }
  });

  it('permits when usage is below the ceiling', () => {
    const plan: Plan = { entitlements: {}, limits: { users: 25 } };
    const decision = evaluateEntitlement(CAP, { limit: 'users' }, plan, { users: 24 });
    expect(decision.permitted).toBe(true);
  });

  it('a null plan refuses any capability carrying a limit key — fail-closed', () => {
    const decision = evaluateEntitlement(CAP, { limit: 'users' }, null, { users: 0 });
    expect(decision.permitted).toBe(false);
  });

  it('no ceiling configured for the key -> no limit to reach, permitted', () => {
    const plan: Plan = { entitlements: {}, limits: {} };
    const decision = evaluateEntitlement(CAP, { limit: 'users' }, plan, { users: 999 });
    expect(decision.permitted).toBe(true);
  });

  it('no usage supplied defaults to 0 — never refuses a ceiling of at least 1', () => {
    const plan: Plan = { entitlements: {}, limits: { users: 1 } };
    const decision = evaluateEntitlement(CAP, { limit: 'users' }, plan);
    expect(decision.permitted).toBe(true);
  });
});
