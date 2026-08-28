/**
 * T016 — assigning a member's position. 017/FR-001..FR-003, FR-005, FR-008, FR-010.
 *
 * FR-010 is a two-part check, and the order matters:
 *
 *   1. the named position must resolve AT ALL under the caller's own tenant — RLS
 *      is what makes a foreign id read as absent, so this is one lookup, not a
 *      tenant comparison written here;
 *   2. it must be `active` to be NEWLY assigned (FR-008) — a retired position stays
 *      valid on entries that already reference it, which is why the read path
 *      resolves retired names happily and only this write path refuses them.
 *
 * Both failures raise the same `PositionNotInCatalog`, deliberately: "another
 * tenant's", "nonexistent" and "retired" must be indistinguishable on the wire
 * (contracts/directory-api.md §2).
 *
 * No lock, no retry, no version column — research.md D5: every reachable outcome
 * of two concurrent assignments is a valid state, so last-write-wins is the whole
 * of the concurrency story here, unlike 004's last-`SA` invariant.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PositionNotInCatalog, ResourceNotFound, ValidationFailed } from '../../common/http/errors';
import {
  DirectoryEntryRepository,
  type DirectoryEntryRow,
  type DirectoryEntryStore,
} from './directory-entry.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssignmentResult {
  readonly row: DirectoryEntryRow;
  /** FR-003's "previous value" — `null` when nothing was ever assigned. */
  readonly previousPositionId: string | null;
}

/**
 * FR-002 — `null` clears the assignment. Anything that is neither `null` nor a
 * well-formed uuid is a malformed request, refused before it can reach a `::uuid`
 * cast and surface as a 500.
 */
function normalisePositionId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || !UUID.test(raw)) {
    throw new ValidationFailed('positionId must be a position identifier, or null to clear it.');
  }
  return raw;
}

@Injectable()
export class DirectoryEntryService {
  constructor(
    @Inject(DirectoryEntryRepository) private readonly entries: DirectoryEntryStore,
  ) {}

  async assign(membershipId: string, rawPositionId: unknown): Promise<AssignmentResult> {
    const positionId = normalisePositionId(rawPositionId);

    // FR-001 — a live membership of the ACTIVE tenant, or nothing. RLS already
    // hides another tenant's row, so this is the same generic not-found a
    // membership that never existed gets (001/FR-008).
    const membership = await this.entries.findLiveMembership(membershipId);
    if (!membership) throw new ResourceNotFound();

    if (positionId !== null) {
      const position = await this.entries.findPosition(positionId);
      if (!position || position.status !== 'active') throw new PositionNotInCatalog();
    }

    const existing = await this.entries.findEntry(membershipId);
    const previousPositionId = existing?.positionId ?? null;

    // Nothing here reads or writes `membership.archetype` — FR-005/SC-009 is a
    // property of what this method touches, asserted as such by
    // tests/unit/directory-entry-independence.test.ts.
    const row = await this.entries.upsertEntry(membershipId, positionId);
    return { row, previousPositionId };
  }
}
