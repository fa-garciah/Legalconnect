/**
 * T016 — FR-001–FR-005, FR-010: assign a position, and read the directory. The two
 * axes (position here, archetype in membership.service.ts) never share a code path,
 * which is what makes SC-009 hold by construction rather than by a check either
 * service has to remember to make.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PositionNotInCatalog, ResourceNotFound } from '../../common/http/errors';
import { DIRECTORY_ENTRY_REPOSITORY, type DirectoryEntryRepository } from './directory-entry.repository';
import { decodeCursor, toPage, type Page } from '../../common/http/pagination';

export interface AssignPositionResult {
  readonly membershipId: string;
  readonly positionId: string | null;
  readonly positionName: string | null;
  readonly previousPositionId: string | null;
}

export interface DirectoryListItem {
  readonly membershipId: string;
  readonly archetype: string;
  readonly positionId: string | null;
  readonly positionName: string | null;
}

@Injectable()
export class DirectoryEntryService {
  constructor(
    @Inject(DIRECTORY_ENTRY_REPOSITORY) private readonly repo: DirectoryEntryRepository,
  ) {}

  async assignPosition(membershipId: string, positionId: string | null): Promise<AssignPositionResult> {
    // Cross-tenant reach and "no such membership" collapse into the same generic
    // not-found (FR-010's contract note; Story 1 scenario 3) — RLS already made a
    // foreign membership invisible before this line runs.
    const membership = await this.repo.findLiveMembership(membershipId);
    if (!membership) throw new ResourceNotFound();

    let positionName: string | null = null;
    if (positionId !== null) {
      // FR-010: must resolve, under RLS, to a row in the caller's own tenant's
      // catalog. FR-008: a retired position may remain on an EXISTING entry, but
      // may not be NEWLY assigned — same refusal code as "does not exist at all"
      // (contracts/directory-api.md), so a caller cannot tell the two apart.
      const position = await this.repo.findPosition(positionId);
      if (!position || position.status !== 'active') throw new PositionNotInCatalog();
      positionName = position.name;
    }

    const previousPositionId = await this.repo.currentPosition(membershipId);
    await this.repo.upsertPosition(membershipId, membership.tenantId, positionId);

    return { membershipId, positionId, positionName, previousPositionId };
  }

  async listDirectory(limit: number, rawCursor: string | undefined): Promise<Page<DirectoryListItem>> {
    const cursor = rawCursor ? decodeCursor(rawCursor) : undefined;
    const rows = await this.repo.listDirectory(limit, cursor);
    const page = toPage(rows, limit, (row) => ({ occurredAt: row.createdAt, id: row.membershipId }));
    return {
      items: page.items.map((row) => ({
        membershipId: row.membershipId,
        archetype: row.archetype,
        positionId: row.positionId,
        positionName: row.positionName,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
