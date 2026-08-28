/**
 * T059 (004) — US6: `AUDIT_ACTIONS` still contains exactly the 16 actions of slices
 * 001 and 002, with 0 additions from 004 itself — the change events already exist and
 * are tested by 002; what 004 adds is the refusal side
 * (refusal-audit-vocabulary.test.ts).
 *
 * Asserted as a subset-and-count check, not exact-set equality, so a later slice
 * adding its own actions (017 adds three — see directory-audit-actions.test.ts) does
 * not have to edit this file to keep proving what it was always about: 004's own
 * contribution to this vocabulary is zero.
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '../../src/common/audit/actions';

const SLICE_001 = [
  'tenant.provisioned',
  'tenant.deactivated',
  'tenant.plan_changed',
  'plan.limits_changed',
  'tenant.cross_access_attempted',
  'audit.queried',
  'tenant.registry_read',
];

const SLICE_002 = [
  'identity.created',
  'membership.created',
  'membership.revoked',
  'membership.archetype_changed',
  'invitation.issued',
  'invitation.seed_issued',
  'invitation.revoked',
  'invitation.accepted',
  'invitation.refused',
];

describe('the audit action vocabulary — 004 adds nothing to what 001/002 shipped', () => {
  it('every one of 001 and 002\'s 16 actions is still present, unchanged', () => {
    for (const action of [...SLICE_001, ...SLICE_002]) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
    expect(new Set([...SLICE_001, ...SLICE_002]).size).toBe(16);
  });
});
