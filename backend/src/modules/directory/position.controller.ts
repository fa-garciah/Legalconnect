/**
 * T023 — the position catalog surface. contracts/directory-api.md §1.
 *
 * Three routes, two capabilities: writing the catalog is row 23
 * (`directory.manage_catalog`, MP+SA), reading it is row 24 (`directory.read`,
 * every internal archetype) — a member who may not edit the catalog still has to
 * be able to render an existing assignment's label.
 *
 * The list is deliberately unpaginated: a firm's own catalog is bounded by how
 * many ranks it actually has, not by the record volume 001/FR-013's pagination
 * convention was built for.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Audited } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { assertUuid } from '../tenant/rfc';
import { PositionService } from './position.service';
import type { CatalogPosition } from './directory-entry.repository';
import type { PositionRow } from './position.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

export interface PositionListResponse {
  readonly items: readonly CatalogPosition[];
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
    const created = await this.positions.create(input.name);
    // Set after the call, so a refused creation (400/409) records nothing.
    req.auditTargetId = created.id;
    return created;
  }

  @Patch(':id/retire')
  @HttpCode(200)
  @Capability('directory.manage_catalog')
  @Audited({ action: 'position.retired', targetEntity: 'position' })
  async retire(@Param('id') id: string, @Req() req: AuditableRequest): Promise<PositionRow> {
    const positionId = assertUuid(id, 'position id');
    // Assigned before the call so a refusal throws before the append — a retirement
    // that did not happen must not appear in the log (001/FR-017, the same ordering
    // `PlatformTenantController.deactivate` uses).
    req.auditTargetId = positionId;
    return this.positions.retire(positionId);
  }

  @Get()
  @Capability('directory.read')
  async list(): Promise<PositionListResponse> {
    return { items: await this.positions.list() };
  }
}
