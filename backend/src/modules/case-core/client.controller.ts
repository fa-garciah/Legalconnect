/**
 * T036 — the client surface. contracts/client-api.md.
 *
 * Five routes, four capabilities: deactivate and reactivate share row 28 (FR-004a).
 *
 * No `@ScopeTarget` anywhere in this file — all four client capabilities are
 * `tenant`-scoped, and RLS already confines them to the caller's own firm. The build gate
 * in `tests/contract/scope-target-declared.test.ts` refuses an inert declaration here.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { decodeCursor } from '../../common/http/pagination';
import { assertUuid } from '../tenant/rfc';
import { ClientService } from './client.service';
import type { ClientRow } from './client.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

/** contracts/client-api.md §1 — the wire shape. */
export interface ClientItem {
  readonly id: string;
  readonly kind: 'organization' | 'person';
  readonly legalName: string;
  readonly rfc: string | null;
  readonly status: 'active' | 'inactive';
}

export interface ClientListResponse {
  readonly items: readonly ClientItem[];
  readonly nextCursor: string | null;
}

const present = (row: ClientRow): ClientItem => ({
  id: row.id,
  kind: row.kind,
  legalName: row.legalName,
  rfc: row.rfc,
  status: row.status,
});

@Controller('tenant/clients')
export class ClientController {
  constructor(private readonly clients: ClientService) {}

  /**
   * FR-002a — `q` and `status` filter, `limit` and `cursor` page.
   *
   * Held by every internal archetype including `BM`: billing needs the party. Principle
   * VI's line is drawn at case CONTENT, not at the client record.
   *
   * Inactive clients are returned by default. Withdrawal removes a client from new case
   * creation; it does not hide the record from a firm that still has open matters against
   * them.
   *
   * No `@Audited`: a client list is not one of the entities Principle V enumerates for
   * access logging, and it discloses no matter content. The single-case read is the one
   * access this slice records (FR-023).
   */
  @Get()
  @Capability('client.read')
  async list(@Query() query: Record<string, unknown>): Promise<ClientListResponse> {
    const cursor = query.cursor ? decodeCursor(String(query.cursor)) : undefined;
    const page = await this.clients.list(query, cursor);
    return { items: page.items.map(present), nextCursor: page.nextCursor };
  }

  @Post()
  @HttpCode(201)
  @Capability('client.create')
  @Audited({ action: 'client.created', targetEntity: 'client' })
  async create(@Body() body: unknown, @Req() req: AuditableRequest): Promise<ClientItem> {
    const row = await this.clients.create(body);
    // Set after the create, so a refused request records nothing.
    req.auditTargetId = row.id;
    return present(row);
  }

  @Patch(':id')
  @HttpCode(200)
  @Capability('client.update')
  @Audited({ action: 'client.updated', targetEntity: 'client' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<ClientItem> {
    const clientId = assertUuid(id, 'client id');
    req.auditTargetId = clientId;

    const { row, previous } = await this.clients.update(clientId, body);

    // 004/FR-009's shape — previous and new for every field that actually moved. Fields
    // the request did not name are omitted rather than recorded as unchanged, so reading
    // the entry answers "what changed" and not "what was sent".
    const changes: Record<string, unknown> = {};
    if (previous.legalName !== row.legalName) {
      changes.legalName = { from: previous.legalName, to: row.legalName };
    }
    if (previous.rfc !== row.rfc) {
      changes.rfc = { from: previous.rfc, to: row.rfc };
    }
    addAuditMetadata(req as object, changes);

    return present(row);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Capability('client.deactivate')
  @Audited({ action: 'client.deactivated', targetEntity: 'client' })
  async deactivate(@Param('id') id: string, @Req() req: AuditableRequest): Promise<ClientItem> {
    const clientId = assertUuid(id, 'client id');
    // Assigned before the call so a refusal (404/409) throws before the append — a
    // withdrawal that did not happen must not appear in the log.
    req.auditTargetId = clientId;
    return present(await this.clients.deactivate(clientId));
  }

  /**
   * FR-004a. Declares `client.deactivate` — the SAME capability, not a twelfth matrix row:
   * whoever may withdraw a client may restore one. `PL` therefore cannot reactivate, for
   * the same reason Q1 denies them deactivation.
   */
  @Post(':id/reactivate')
  @HttpCode(200)
  @Capability('client.deactivate')
  @Audited({ action: 'client.reactivated', targetEntity: 'client' })
  async reactivate(@Param('id') id: string, @Req() req: AuditableRequest): Promise<ClientItem> {
    const clientId = assertUuid(id, 'client id');
    req.auditTargetId = clientId;
    return present(await this.clients.reactivate(clientId));
  }
}
