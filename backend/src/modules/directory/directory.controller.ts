/**
 * T017 — the directory surface. contracts/directory-api.md §2.
 *
 * `@Capability('directory.assign_position')` is decided by `AuthorizationInterceptor`
 * against `matrix.ts` (004) — nothing in this file checks an archetype. `@Audited`
 * declares the action; `AuditInterceptor` appends it inside the same transaction the
 * mutation runs in, so a failed append rolls the assignment back with it (001/FR-017).
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Query, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { decodeCursor, normaliseLimit, toPage } from '../../common/http/pagination';
import { assertUuid } from '../tenant/rfc';
import { DirectoryEntryService } from './directory-entry.service';
import {
  DirectoryEntryRepository,
  type DirectoryEntryRow,
  type DirectoryListingRow,
} from './directory-entry.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

/** contracts/directory-api.md §2 — the wire shape, without the cursor field. */
export interface DirectoryItem {
  readonly membershipId: string;
  readonly archetype: string;
  readonly positionId: string | null;
  readonly positionName: string | null;
}

export interface DirectoryResponse {
  readonly items: readonly DirectoryItem[];
  readonly nextCursor: string | null;
}

const present = (row: DirectoryListingRow): DirectoryItem => ({
  membershipId: row.membershipId,
  archetype: row.archetype,
  positionId: row.positionId,
  positionName: row.positionName,
});

@Controller('tenant/directory')
export class DirectoryController {
  constructor(
    private readonly entries: DirectoryEntryService,
    private readonly directory: DirectoryEntryRepository,
  ) {}

  @Patch('entries/:membershipId/position')
  @HttpCode(200)
  @Capability('directory.assign_position')
  @Audited({ action: 'directory.position_assigned', targetEntity: 'membership' })
  async assignPosition(
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<DirectoryEntryRow> {
    const id = assertUuid(membershipId, 'membership id');
    // FR-003's subject: the membership whose position changed, not the position.
    req.auditTargetId = id;

    const input = (body ?? {}) as { positionId?: unknown };
    const { row, previousPositionId } = await this.entries.assign(id, input.positionId ?? null);

    // 004/FR-009's shape, reused verbatim for the analogous change.
    addAuditMetadata(req as object, { from: previousPositionId, to: row.positionId });
    return row;
  }

  /**
   * T026 — the read every internal archetype holds (row 24). FR-011, FR-013.
   *
   * No `@Audited`: a directory read is not one of the three actions FR-003
   * enumerates, and 001/FR-014's vocabulary is a closed set, not "everything".
   * Nothing here is a monitorable log either, so no channel gate applies.
   *
   * `common/http/pagination.ts` verbatim — same `limit`/`cursor` parameters, same
   * opaque cursor, same `limit + 1` existence proof the audit read already uses.
   */
  @Get()
  @Capability('directory.read')
  async list(@Query() query: Record<string, unknown>): Promise<DirectoryResponse> {
    const limit = normaliseLimit(query.limit);
    const cursor = query.cursor ? decodeCursor(String(query.cursor)) : undefined;

    const rows = await this.directory.listDirectory({ limit, cursor });
    const page = toPage(rows, limit, (row) => ({
      occurredAt: row.occurredAt,
      id: row.membershipId,
    }));

    return { items: page.items.map(present), nextCursor: page.nextCursor };
  }
}
