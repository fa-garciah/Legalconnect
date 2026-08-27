/**
 * T019 — the four portal archetypes hold zero tenant-scoped capabilities. FR-020,
 * SC-004.
 *
 * Read as *zero tenant-scoped capability*, per research.md D8: rows 9-10
 * (`invitation.accept_own`, `membership.read_own`) resolve at `self` scope and are not
 * archetype-decided by anybody — asserting them empty for these four archetypes would
 * assert nothing true about entitlement and would break a capability 002 shipped and
 * tested (a portal archetype accepting its own invitation). See matrix-exhaustive.test.ts
 * for the full exhaustive suite this test is one focused slice of.
 */
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, capabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { MATRIX } from '../../src/common/authz/matrix';

const PORTAL_ARCHETYPES = ['CC', 'IC', 'CB', 'EL'] as const;

describe('portal archetypes hold zero tenant-scoped capabilities', () => {
  const tenantScopedIds = (Object.keys(CAPABILITIES) as CapabilityId[]).filter(
    (id) => capabilityDef(id).scope === 'tenant',
  );

  it('there are 11 tenant-scoped capabilities in this registry (rows 1-8, plus 017 rows 22-24)', () => {
    expect(tenantScopedIds).toHaveLength(11);
  });

  for (const archetype of PORTAL_ARCHETYPES) {
    for (const id of tenantScopedIds) {
      it(`${archetype} does not hold ${id}`, () => {
        expect(MATRIX[id].has(archetype)).toBe(false);
      });
    }
  }
});
