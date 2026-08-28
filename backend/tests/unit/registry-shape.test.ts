/**
 * T004 — the capability registry's own shape. FR-013, FR-018.
 */
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, capabilityDef, type CapabilityId } from '../../src/common/authz/capability';

const VALID_SCOPE_KINDS = new Set(['tenant', 'self', 'assigned', 'none']);
const MODULE_VERB = /^[a-z]+\.[a-z_]+$/;

const STEP_UP_ROWS: readonly CapabilityId[] = [
  'invitation.issue',
  'invitation.revoke',
  'membership.revoke',
  'membership.change_archetype',
  'invitation.issue_seed',
];

describe('capability registry shape', () => {
  const ids = Object.keys(CAPABILITIES) as CapabilityId[];

  it('holds exactly 35 rows (21 from 004, 017 rows 22-24, 006 rows 25-35)', () => {
    expect(ids).toHaveLength(35);
    expect(new Set(ids).size).toBe(35);
  });

  it('every id matches module.verb', () => {
    for (const id of ids) {
      expect(id).toMatch(MODULE_VERB);
    }
  });

  it('every capability declares exactly one scope, one of tenant|self|assigned|none', () => {
    for (const id of ids) {
      const def = capabilityDef(id);
      expect(VALID_SCOPE_KINDS.has(def.scope)).toBe(true);
    }
  });

  it('exactly rows 2, 3, 6, 7 and 17 carry stepUp: true', () => {
    const stepUp = ids.filter((id) => capabilityDef(id).stepUp === true);
    expect(new Set(stepUp)).toEqual(new Set(STEP_UP_ROWS));
  });

  it('no capability outside the step-up set carries stepUp', () => {
    for (const id of ids) {
      if (STEP_UP_ROWS.includes(id)) continue;
      expect(capabilityDef(id).stepUp).toBeUndefined();
    }
  });
});
