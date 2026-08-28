/**
 * contracts/directory-api.md — the position catalog: create, retire, list.
 * `@Capability` is decided by `AuthorizationInterceptor` against `matrix.ts` (004).
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Audited } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { assertUuid } from '../tenant/rfc';
import { PositionService } from './position.service';
import type { PositionRow } from './position.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@Controller('tenant/directory/positions')
export class PositionController {
  constructor(private readonly positions: PositionService) {}

  @Post()
  @HttpCode(201)
  @Capability('directory.manage_catalog')
  @Audited({ action: 'position.created', targetEntity: 'position' })
  async create(@Body() body: unknown, @Req() req: AuditableRequest): Promise<PositionRow> {
    const input = (body ?? {}) as { name?: unknown };
    const row = await this.positions.create(input.name);
    req.auditTargetId = row.id;
    return row;
  }

  @Patch(':id/retire')
  @HttpCode(200)
  @Capability('directory.manage_catalog')
  @Audited({ action: 'position.retired', targetEntity: 'position' })
  async retire(@Param('id') id: string, @Req() req: AuditableRequest): Promise<PositionRow> {
    const positionId = assertUuid(id, 'position id');
    req.auditTargetId = positionId;
    return this.positions.retire(positionId);
  }

  @Get()
  @Capability('directory.read')
  async list(): Promise<{ items: readonly PositionRow[] }> {
    return { items: await this.positions.list() };
  }
}
