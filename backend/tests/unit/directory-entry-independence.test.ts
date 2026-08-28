/**
 * T013 — SC-009: a pure test of the repository/service layer, no database. Position
 * and archetype are read and written through entirely separate columns/tables
 * (FR-005) — this asserts that independence structurally, by exercising
 * `DirectoryEntryService` against a fake repository that also tracks a fixture
 * archetype field the service never touches.
 */
import { describe, expect, it } from 'vitest';
import { DirectoryEntryService } from '../../src/modules/directory/directory-entry.service';
import type { DirectoryEntryRepository, CatalogPosition } from '../../src/modules/directory/directory-entry.repository';

interface FixtureMembership {
  id: string;
  tenantId: string;
  archetype: string;
  positionId: string | null;
}

class FakeDirectoryEntryRepository implements DirectoryEntryRepository {
  constructor(
    private readonly membership: FixtureMembership,
    private readonly catalog: Map<string, CatalogPosition>,
  ) {}

  async findPosition(positionId: string): Promise<CatalogPosition | null> {
    return this.catalog.get(positionId) ?? null;
  }

  async findLiveMembership(membershipId: string): Promise<{ id: string; tenantId: string } | null> {
    if (membershipId !== this.membership.id) return null;
    return { id: this.membership.id, tenantId: this.membership.tenantId };
  }

  async currentPosition(membershipId: string): Promise<string | null> {
    return membershipId === this.membership.id ? this.membership.positionId : null;
  }

  async upsertPosition(membershipId: string, _tenantId: string, positionId: string | null): Promise<void> {
    if (membershipId === this.membership.id) this.membership.positionId = positionId;
  }

  async listDirectory(): Promise<never[]> {
    throw new Error('not exercised by this fixture — SC-009 concerns assignment only');
  }
}

describe('SC-009 — position and archetype move independently (unit, no database)', () => {
  it('assigning a position never reads or writes the fixture archetype field', async () => {
    const membership: FixtureMembership = { id: 'm1', tenantId: 't1', archetype: 'AA', positionId: null };
    const catalog = new Map<string, CatalogPosition>([['p1', { id: 'p1', name: 'Socio', status: 'active' }]]);
    const service = new DirectoryEntryService(new FakeDirectoryEntryRepository(membership, catalog));

    await service.assignPosition('m1', 'p1');

    expect(membership.archetype).toBe('AA');
    expect(membership.positionId).toBe('p1');
  });

  it('an archetype change made elsewhere leaves an already-assigned position untouched', async () => {
    const membership: FixtureMembership = { id: 'm1', tenantId: 't1', archetype: 'AA', positionId: 'p1' };
    const catalog = new Map<string, CatalogPosition>([['p1', { id: 'p1', name: 'Socio', status: 'active' }]]);
    const service = new DirectoryEntryService(new FakeDirectoryEntryRepository(membership, catalog));

    // The archetype axis (004/FR-009) moves independently of this service entirely —
    // simulated here by mutating the fixture directly, the way a wholly separate
    // membership.service.ts call would.
    membership.archetype = 'PL';

    const before = await service.assignPosition('m1', 'p1');
    expect(before.previousPositionId).toBe('p1');
    expect(membership.archetype).toBe('PL');
    expect(membership.positionId).toBe('p1');
  });
});
