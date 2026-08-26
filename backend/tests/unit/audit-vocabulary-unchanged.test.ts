/**
 * T059 — US6: `AUDIT_ACTIONS` still holds exactly the 16 actions of slices 001 and
 * 002. This slice adds none — the change events already exist and are tested by 002;
 * what 004 adds is the refusal side (refusal-audit-vocabulary.test.ts).
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

describe('the audit action vocabulary is unchanged by 004', () => {
  it('holds exactly 16 actions', () => {
    expect(AUDIT_ACTIONS).toHaveLength(16);
  });

  it('is exactly the union of the 7 actions from 001 and the 9 from 002 — 0 additions', () => {
    expect([...AUDIT_ACTIONS].sort()).toEqual([...SLICE_001, ...SLICE_002].sort());
  });
});
