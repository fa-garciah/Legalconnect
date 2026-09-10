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

/**
 * T093 (003) — `mfa_not_enrolled` STAYS AT POSITION 1, AND STAYS UNAUDITED.
 *
 * 004 fixed this as the first refusal, ahead of permission, scope and
 * entitlement, and 003 is the slice that finally makes the state it names
 * reachable — an identity can now actually be unenrolled and then enroll. The
 * risk this guards is that making it producible tempted somebody to reorder it
 * or to start auditing it.
 *
 * WHY IT MUST STAY FIRST: a person who has not enrolled should be told to
 * enroll, not told they lack permission. Reordering it would send an
 * unenrolled Managing Partner a not_authorized for a capability they hold,
 * which is both wrong and unactionable.
 *
 * WHY IT STAYS UNAUDITED (FR-039): it is a precondition failure by a legitimate
 * member, not a change of state and not a security signal. 002's open item 3
 * reached the same conclusion. Auditing it would fill the log with rows saying
 * "somebody who has not finished setting up tried to use the product", which
 * is noise in the one place noise is expensive.
 */
describe('003/T093 — mfa_not_enrolled is unmoved and unaudited', () => {
  it('is position 1 of REFUSAL_ORDER, unchanged by this slice', async () => {
    const { REFUSAL_ORDER } = await import('../../src/common/authz/refusal');
    expect(REFUSAL_ORDER[0]).toBe('mfa_not_enrolled');
  });

  it('is NOT in the audit vocabulary — it cannot be written even deliberately', async () => {
    const { AUDIT_ACTIONS } = await import('../../src/common/audit/actions');
    expect(AUDIT_ACTIONS as readonly string[]).not.toContain('mfa_not_enrolled');
    // Nor under any near-miss spelling somebody might reach for.
    for (const action of AUDIT_ACTIONS as readonly string[]) {
      expect(action).not.toMatch(/mfa[_.]?not[_.]?enrolled|enrollment\.required/i);
    }
  });

  it('no source file writes it as an audit action', async () => {
    // The vocabulary check above would not catch a raw INSERT that bypassed
    // `AUDIT_ACTIONS`, and 003 writes audit rows in raw SQL from the auth
    // module — which is exactly where such a bypass would live.
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts')) files.push(full);
      }
    };
    walk(join(__dirname, '..', '..', 'src'));

    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Any file that both writes audit rows and mentions this reason. A
      // narrower pattern kept catching REFUSAL_ORDER itself, which is the
      // ordering DEFINITION and exactly what the first test asserts should be
      // there — the check has to distinguish naming it from logging it.
      const writesAudit = /INSERT INTO audit_event|appendAuditEntry|this\.audit\(/.test(code);
      if (writesAudit) {
        expect(code, `${file} both writes audit rows and names mfa_not_enrolled`).not.toContain(
          'mfa_not_enrolled',
        );
      }
    }
  });
});
