/**
 * T006 — the matrix's own shape, independent of which capability resolves to which
 * subjects (that's matrix-exhaustive.test.ts, US2). FR-008, FR-021.
 */
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, capabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { MATRIX, SUBJECTS } from '../../src/common/authz/matrix';

const EMPTY_ROWS: readonly CapabilityId[] = [
  'identity.read_registry',
  'identity.hard_delete',
  'membership.create_direct',
  'archetype.redefine',
];

const PO_ONLY_ROWS: readonly CapabilityId[] = [
  'tenant.provision',
  'tenant.deactivate',
  'tenant.read_registry',
  'audit.read_platform',
  'tenant.change_plan',
  'plan.configure_limits',
  'invitation.issue_seed',
];

describe('matrix shape', () => {
  const ids = Object.keys(CAPABILITIES) as CapabilityId[];

  it('has a row for every CapabilityId, and no key that is not one', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...ids].sort());
  });

  it('every subject in every row is one of the eleven codes', () => {
    const valid = new Set(SUBJECTS);
    for (const id of ids) {
      for (const subject of MATRIX[id]) {
        expect(valid.has(subject)).toBe(true);
      }
    }
  });

  it('rows 18-21 are empty sets — held by nobody', () => {
    for (const id of EMPTY_ROWS) {
      expect(MATRIX[id].size).toBe(0);
    }
  });

  it('rows 11-17 are exactly {PO}', () => {
    for (const id of PO_ONLY_ROWS) {
      expect(MATRIX[id]).toEqual(new Set(['PO']));
    }
  });

  it('no tenant-scoped row contains PO (FR-008)', () => {
    for (const id of ids) {
      if (capabilityDef(id).scope !== 'tenant') continue;
      expect(MATRIX[id].has('PO')).toBe(false);
    }
  });
});
