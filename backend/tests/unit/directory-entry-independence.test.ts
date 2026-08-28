/**
 * T013 — 017/FR-005, SC-009: position and archetype move independently.
 *
 * A pure test of the service layer. No database, no Nest container, no HTTP: the
 * service is constructed directly against an in-memory store, for the same reason
 * 004's matrix suite runs without Testcontainers — the property under test is a
 * property of the code, not of Postgres, and asserting it here means it holds even
 * where RLS and the schema are not in the picture at all.
 *
 * The store deliberately keeps memberships and directory entries in two separate
 * maps and records every write it is asked to make, so "the archetype was left
 * untouched" is asserted as *no write was even attempted*, not merely as
 * "the value happens to still read the same".
 */
import { describe, expect, it } from 'vitest';
import { DirectoryEntryService } from '../../src/modules/directory/directory-entry.service';
import type {
  CatalogPosition,
  DirectoryEntryRow,
  DirectoryEntryStore,
  MembershipSubject,
} from '../../src/modules/directory/directory-entry.repository';
import { PositionNotInCatalog } from '../../src/common/http/errors';

const MEMBERSHIP = '11111111-1111-4111-8111-111111111111';
const SOCIO = '22222222-2222-4222-8222-222222222222';
const ASOCIADO = '33333333-3333-4333-8333-333333333333';
const RETIRED = '44444444-4444-4444-8444-444444444444';
const ABSENT = '55555555-5555-4555-8555-555555555555';

/** Every mutation the service asked for, in order — see the file header. */
type Write = { readonly table: 'membership' | 'directory_entry'; readonly value: unknown };

class InMemoryDirectoryStore implements DirectoryEntryStore {
  readonly writes: Write[] = [];

  readonly memberships = new Map<string, MembershipSubject>([
    [MEMBERSHIP, { id: MEMBERSHIP, archetype: 'AA' }],
  ]);

  readonly positions = new Map<string, CatalogPosition>([
    [SOCIO, { id: SOCIO, name: 'Socio', status: 'active' }],
    [ASOCIADO, { id: ASOCIADO, name: 'Asociado', status: 'active' }],
    [RETIRED, { id: RETIRED, name: 'Of Counsel', status: 'retired' }],
  ]);

  readonly entries = new Map<string, string | null>();

  async findLiveMembership(membershipId: string): Promise<MembershipSubject | null> {
    return this.memberships.get(membershipId) ?? null;
  }

  async findPosition(positionId: string): Promise<CatalogPosition | null> {
    return this.positions.get(positionId) ?? null;
  }

  async findEntry(membershipId: string): Promise<{ readonly positionId: string | null } | null> {
    if (!this.entries.has(membershipId)) return null;
    return { positionId: this.entries.get(membershipId) ?? null };
  }

  async upsertEntry(membershipId: string, positionId: string | null): Promise<DirectoryEntryRow> {
    this.writes.push({ table: 'directory_entry', value: { membershipId, positionId } });
    this.entries.set(membershipId, positionId);
    return {
      membershipId,
      positionId,
      positionName: positionId ? (this.positions.get(positionId)?.name ?? null) : null,
    };
  }

  /** What `MembershipService.changeArchetype` (002/004) does, in this fixture's terms. */
  changeArchetype(membershipId: string, archetype: string): void {
    this.writes.push({ table: 'membership', value: { membershipId, archetype } });
    this.memberships.set(membershipId, { id: membershipId, archetype });
  }
}

const build = (): { store: InMemoryDirectoryStore; service: DirectoryEntryService } => {
  const store = new InMemoryDirectoryStore();
  return { store, service: new DirectoryEntryService(store) };
};

describe('position and archetype are independent axes (SC-009)', () => {
  it('assigning a position writes only the directory entry — the archetype is never touched', async () => {
    const { store, service } = build();

    await service.assign(MEMBERSHIP, SOCIO);

    expect(store.memberships.get(MEMBERSHIP)!.archetype).toBe('AA');
    expect(store.writes.map((w) => w.table)).toEqual(['directory_entry']);
    expect(store.writes.some((w) => w.table === 'membership')).toBe(false);
  });

  it('changing the archetype leaves the assigned position exactly where it was', async () => {
    const { store, service } = build();

    await service.assign(MEMBERSHIP, SOCIO);
    store.changeArchetype(MEMBERSHIP, 'CM');

    expect(store.entries.get(MEMBERSHIP)).toBe(SOCIO);
    const entry = await store.findEntry(MEMBERSHIP);
    expect(entry).toEqual({ positionId: SOCIO });
    expect(store.memberships.get(MEMBERSHIP)!.archetype).toBe('CM');
  });

  it('re-assigning reports the previous position and still leaves the archetype alone', async () => {
    const { store, service } = build();

    const first = await service.assign(MEMBERSHIP, SOCIO);
    expect(first.previousPositionId).toBeNull();

    const second = await service.assign(MEMBERSHIP, ASOCIADO);
    expect(second.previousPositionId).toBe(SOCIO);
    expect(second.row).toEqual({
      membershipId: MEMBERSHIP,
      positionId: ASOCIADO,
      positionName: 'Asociado',
    });
    expect(store.memberships.get(MEMBERSHIP)!.archetype).toBe('AA');
  });

  it('clearing the position (FR-002) writes the entry and nothing else', async () => {
    const { store, service } = build();

    await service.assign(MEMBERSHIP, SOCIO);
    const cleared = await service.assign(MEMBERSHIP, null);

    expect(cleared.row.positionId).toBeNull();
    expect(cleared.row.positionName).toBeNull();
    expect(cleared.previousPositionId).toBe(SOCIO);
    expect(store.writes.every((w) => w.table === 'directory_entry')).toBe(true);
  });

  it('FR-010 — a position absent from the catalog is refused, and nothing at all is written', async () => {
    const { store, service } = build();

    await expect(service.assign(MEMBERSHIP, ABSENT)).rejects.toBeInstanceOf(PositionNotInCatalog);
    expect(store.writes).toEqual([]);
    expect(store.entries.size).toBe(0);
  });

  it('FR-008 — a retired position is refused for a NEW assignment, with the same refusal as an absent one', async () => {
    const { store, service } = build();

    await expect(service.assign(MEMBERSHIP, RETIRED)).rejects.toBeInstanceOf(PositionNotInCatalog);
    expect(store.writes).toEqual([]);
  });
});
