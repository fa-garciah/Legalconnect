/**
 * T034 — US2: every (subject × capability) pair is asserted, none sampled. SC-001.
 * Iterates `Object.keys(CAPABILITIES)` — never a hand-written list (FR-018) — across
 * the eleven subjects, and asserts each outcome against data-model.md's resolved
 * table, transcribed here independently of `matrix.ts` so this is a genuine
 * cross-check rather than the constant restating itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decide, type DecisionInput } from '../../src/common/authz/decide';
import { CAPABILITIES, type CapabilityId } from '../../src/common/authz/capability';
import { SUBJECTS, type Subject } from '../../src/common/authz/matrix';
import {
  registerScopeResolver,
  unregisterScopeResolver,
  type ScopeResolver,
} from '../../src/common/authz/scope';

/**
 * A permissive stub for the `assigned` kind, so this suite measures the MATRIX and nothing
 * else.
 *
 * Without it `resolverFor('assigned')` returns `undefined` in a unit context — the real
 * one is registered by `CaseCoreModule.onModuleInit`, which no unit test boots — and
 * `decide()` refuses fail-closed. Every `assigned` row would then read as "refused" for
 * every subject, and this file would report the matrix as denying archetypes it permits.
 *
 * The same stub 004 used for its own scope tests, and for the same reason: whether the
 * resolver grants or refuses is an entity question, asserted against real assignment rows
 * in `tests/integration/assigned-scope-resolver.test.ts`.
 */
const PERMISSIVE_ASSIGNED: ScopeResolver = {
  kind: 'assigned',
  resolve: async () => true,
};

/** data-model.md, "The rows, as resolved" — rows 1-8, tenant scope. */
const TENANT_ROWS: Readonly<Record<string, readonly Subject[]>> = {
  'audit.read_own_tenant': ['SA'],
  'invitation.issue': ['SA', 'MP'],
  'invitation.revoke': ['SA', 'MP'],
  'invitation.read_pending': ['SA', 'MP'],
  'membership.read_tenant': ['SA', 'MP'],
  'membership.revoke': ['SA', 'MP'],
  'membership.change_archetype': ['SA'],
  'plan.read_own_tenant': ['SA', 'MP', 'BM'],
  // 017-firm-directory, rows 22-24 — extends 004's registry per FR-016.
  'directory.assign_position': ['MP', 'SA'],
  'directory.manage_catalog': ['MP', 'SA'],
  'directory.read': ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'],
  // 006-client-case-core, the eight `tenant`-scoped rows of 25-35.
  //
  // `PL` holds create and update but not deactivate (006/spec.md Q1); `BM` holds every
  // client row and the catalog read but NO case row (Principle VI's minimisation clause);
  // `case.read_list` is `tenant` rather than `assigned` because a scope refusal cannot
  // express "an empty list" (006/FR-014).
  'client.read': ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'],
  'client.create': ['MP', 'PL', 'BM', 'SA'],
  'client.update': ['MP', 'PL', 'BM', 'SA'],
  'client.deactivate': ['MP', 'BM', 'SA'],
  'case.read_list': ['MP', 'AA', 'PL', 'CM', 'SA'],
  'case.create': ['MP', 'CM', 'SA'],
  'case.read_catalog': ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'],
  'case.manage_catalog': ['MP', 'SA'],
};

/**
 * 006-client-case-core, the three `assigned`-scoped rows of 25-35 — the FIRST capabilities
 * in the product to resolve at that kind.
 *
 * Held in their own group rather than folded into TENANT_ROWS because `decide()` treats
 * them differently at the scope step: the matrix decides the archetype exactly as it does
 * for `tenant`, and then a resolver decides the entity. This suite asserts the FIRST half
 * only — that the right archetypes reach the scope check at all. Whether the resolver then
 * grants or refuses is not an archetype question and is asserted where it belongs, in
 * `tests/integration/assigned-scope-resolver.test.ts` against real assignment rows.
 *
 * `outcome()` below registers a permissive stub for the `assigned` kind precisely so this
 * file measures the matrix and nothing else.
 */
const ASSIGNED_ROWS: Readonly<Record<string, readonly Subject[]>> = {
  'case.read': ['MP', 'AA', 'PL', 'CM', 'SA'],
  'case.change_status': ['MP', 'AA', 'CM', 'SA'],
  'case.manage_team': ['MP', 'CM', 'SA'],
};

/** Rows 9-10, `self` scope — not archetype-decided by anybody (research.md D8). */
const SELF_ROWS: readonly CapabilityId[] = ['invitation.accept_own', 'membership.read_own'];

/** Rows 11-17, `none` scope — PO only. */
const PO_ROWS: readonly CapabilityId[] = [
  'tenant.provision',
  'tenant.deactivate',
  'tenant.read_registry',
  'audit.read_platform',
  'tenant.change_plan',
  'plan.configure_limits',
  'invitation.issue_seed',
];

/** Rows 18-21, `none` scope — held by nobody. */
const EMPTY_ROWS: readonly CapabilityId[] = [
  'identity.read_registry',
  'identity.hard_delete',
  'membership.create_direct',
  'archetype.redefine',
];

function scopeFor(subject: Subject): DecisionInput['scope'] {
  const principal =
    subject === 'PO' ? null : { identityId: 'i', membershipId: 'm', tenantId: 't', archetype: subject };
  return {
    subject,
    capability: 'audit.read_own_tenant',
    principal,
    identityId: 'i',
    targetTenantId: subject === 'PO' ? null : 't',
    targetId: null,
  };
}

async function outcome(subject: Subject, capability: CapabilityId): Promise<boolean> {
  const decision = await decide({
    subject,
    capability,
    mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
    scope: { ...scopeFor(subject), capability },
    plan: null,
  });
  return decision.permitted;
}

describe('matrix — exhaustive, every (subject × capability) pair', () => {
  const allIds = Object.keys(CAPABILITIES) as CapabilityId[];

  beforeAll(() => registerScopeResolver(PERMISSIVE_ASSIGNED));
  afterAll(() => unregisterScopeResolver('assigned'));

  it('0 capabilities are unasserted by this suite', () => {
    const asserted = new Set([
      ...Object.keys(TENANT_ROWS),
      ...Object.keys(ASSIGNED_ROWS),
      ...SELF_ROWS,
      ...PO_ROWS,
      ...EMPTY_ROWS,
    ]);
    // 21 (004) + 3 (017) + 11 (006). A census, moved by every slice that extends the
    // registry — 017 took it from 21 to 24.
    expect(asserted.size).toBe(35);
    expect([...allIds].sort()).toEqual([...asserted].sort());
  });

  describe('the assigned-scope rows (006) — the archetype half of the decision', () => {
    for (const [id, permittedSubjects] of Object.entries(ASSIGNED_ROWS)) {
      for (const subject of SUBJECTS) {
        const expected = permittedSubjects.includes(subject);
        it(`${id} × ${subject} -> ${expected ? 'reaches scope' : 'refused on permission'}`, async () => {
          expect(await outcome(subject, id as CapabilityId)).toBe(expected);
        });
      }
    }
  });

  describe('rows 1-8 (tenant scope)', () => {
    for (const [id, permittedSubjects] of Object.entries(TENANT_ROWS)) {
      for (const subject of SUBJECTS) {
        const expected = permittedSubjects.includes(subject);
        it(`${id} × ${subject} -> ${expected ? 'permitted' : 'refused'}`, async () => {
          expect(await outcome(subject, id as CapabilityId)).toBe(expected);
        });
      }
    }
  });

  describe('rows 9-10 (self scope) — archetype-independent, research.md D8', () => {
    for (const id of SELF_ROWS) {
      it(`${id}: identity matching its own target is permitted regardless of archetype`, async () => {
        for (const subject of SUBJECTS) {
          const decision = await decide({
            subject,
            capability: id,
            mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
            scope: {
              subject,
              capability: id,
              principal: subject === 'PO' ? null : { identityId: 'i', membershipId: 'm', tenantId: 't', archetype: subject },
              identityId: 'i',
              targetTenantId: null,
              targetId: null,
            },
            plan: null,
          });
          expect(decision.permitted).toBe(true);
        }
      });
    }
  });

  describe('rows 11-17 (none scope) — PO only', () => {
    for (const id of PO_ROWS) {
      for (const subject of SUBJECTS) {
        const expected = subject === 'PO';
        it(`${id} × ${subject} -> ${expected ? 'permitted' : 'refused'}`, async () => {
          expect(await outcome(subject, id)).toBe(expected);
        });
      }
    }
  });

  describe('rows 18-21 — held by nobody', () => {
    for (const id of EMPTY_ROWS) {
      for (const subject of SUBJECTS) {
        it(`${id} × ${subject} -> refused`, async () => {
          expect(await outcome(subject, id)).toBe(false);
        });
      }
    }
  });

  it('PO is refused all 8 tenant-scoped capabilities, and permitted exactly the 7 platform ones', async () => {
    const tenantResults = await Promise.all(Object.keys(TENANT_ROWS).map((id) => outcome('PO', id as CapabilityId)));
    expect(tenantResults.every((r) => r === false)).toBe(true);

    const platformResults = await Promise.all(PO_ROWS.map((id) => outcome('PO', id)));
    expect(platformResults.every((r) => r === true)).toBe(true);
    expect(platformResults).toHaveLength(7);
  });
});
