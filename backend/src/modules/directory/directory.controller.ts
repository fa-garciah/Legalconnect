/**
 * contracts/directory-api.md — assign a member's position, and read the directory.
 * `@Capability` is decided by `AuthorizationInterceptor` against `matrix.ts` (004).
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Query, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { ValidationFailed } from '../../common/http/errors';
import { normaliseLimit, type Page } from '../../common/http/pagination';
import { assertUuid } from '../tenant/rfc';
import { DirectoryEntryService, type DirectoryListItem } from './directory-entry.service';

interface AuditableRequest {
  auditTargetId?: string | null;
}

function normalisePositionId(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new ValidationFailed('positionId must be a string or null.');
  return assertUuid(raw, 'position id');
}

@Controller('tenant/directory')
export class DirectoryController {
  constructor(private readonly directoryEntries: DirectoryEntryService) {}

  @Patch('entries/:membershipId/position')
  @HttpCode(200)
  @Capability('directory.assign_position')
  @Audited({ action: 'directory.position_assigned', targetEntity: 'membership' })
  async assignPosition(
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<{ membershipId: string; positionId: string | null; positionName: string | null }> {
    const id = assertUuid(membershipId, 'membership id');
    const input = (body ?? {}) as { positionId?: unknown };
    if (!('positionId' in input)) throw new ValidationFailed('positionId is required.');
    const positionId = normalisePositionId(input.positionId ?? null);

    req.auditTargetId = id;
    const result = await this.directoryEntries.assignPosition(id, positionId);
    addAuditMetadata(req as object, { from: result.previousPositionId, to: result.positionId });

    return { membershipId: result.membershipId, positionId: result.positionId, positionName: result.positionName };
  }

  @Get()
  @Capability('directory.read')
  async list(@Query('limit') rawLimit: unknown, @Query('cursor') cursor: unknown): Promise<Page<DirectoryListItem>> {
    const limit = normaliseLimit(rawLimit);
    return this.directoryEntries.listDirectory(limit, typeof cursor === 'string' ? cursor : undefined);
  }
}
