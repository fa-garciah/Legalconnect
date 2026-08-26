/**
 * T090 — the cross-tenant counterpart of the tenant-facing audit read.
 * contracts/platform-admin.md: same query grammar, but `tenantId` is an accepted
 * filter rather than being implicit, and results may span tenants.
 *
 * Because a result set here can span tenants, each item carries its `tenantId` —
 * the tenant-facing read omits it because it would be redundant noise there; here
 * it is the only thing that tells two items apart.
 *
 * The `audit.queried` entry can only be attributed to a tenant when the caller
 * named one: `AuditInterceptor` skips recording when a platform route sets no
 * `auditTargetId`, which is correct here — an unfiltered, cross-tenant read has no
 * single tenant's log to record itself into.
 */
import { Controller, Get, Query, Req } from '@nestjs/common';
import { PlatformSurface } from '../../common/permissions/guard';
import { Capability } from '../../common/authz/declare';
import { Audited } from '../../common/audit/interceptor';
import { currentPlatformTx } from '../../common/db/platform-context';
import { resolveWindow, type ServedWindow } from './window';
import { queryAuditEvents } from './audit.repository';
import { decodeCursor, normaliseLimit, toPage } from '../../common/http/pagination';
import { parseActionFilter, parseOptionalString, presentAuditEvent, type AuditEventResponseItem } from './present';

interface AuditableRequest {
  auditTargetId?: string | null;
}

export type PlatformAuditEventItem = AuditEventResponseItem & { readonly tenantId: string | null };

export interface PlatformAuditEventsResponse {
  readonly items: readonly PlatformAuditEventItem[];
  readonly nextCursor: string | null;
  readonly servedWindow: ServedWindow;
}

@PlatformSurface()
@Controller('internal/platform/audit')
export class PlatformAuditController {
  @Get()
  @Capability('audit.read_platform')
  @Audited({ action: 'audit.queried', targetEntity: 'audit_event', platform: true })
  async list(
    @Query() query: Record<string, unknown>,
    @Req() req: AuditableRequest,
  ): Promise<PlatformAuditEventsResponse> {
    const { from, to, servedWindow } = resolveWindow(query.from, query.to);
    const limit = normaliseLimit(query.limit);
    const cursor = query.cursor ? decodeCursor(String(query.cursor)) : undefined;
    const tenantId = parseOptionalString(query.tenantId);

    if (tenantId) req.auditTargetId = tenantId;

    const rows = await queryAuditEvents(currentPlatformTx(), {
      from,
      to,
      tenantId,
      action: parseActionFilter(query.action),
      targetEntity: parseOptionalString(query.targetEntity),
      targetId: parseOptionalString(query.targetId),
      cursor,
      limit,
    });

    const page = toPage(rows, limit, (row) => ({ occurredAt: row.occurredAt.toISOString(), id: row.id }));

    return {
      items: page.items.map((row) => ({ ...presentAuditEvent(row), tenantId: row.tenantId })),
      nextCursor: page.nextCursor,
      servedWindow,
    };
  }
}
