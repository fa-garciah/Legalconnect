/**
 * T088 / T089 — the tenant-facing audit read. FR-013: queryable by an authorized
 * role, scoped to that role's own tenant, in bounded portions.
 *
 * No `tenantId` parameter here and none in the response: RLS already restricts
 * `currentTx()` to the active tenant, so passing one would be redundant at best and
 * a spoofable no-op at worst. Scope comes from the transaction, not from the query.
 *
 * `@Capability('audit.read_own_tenant')` is decided by `AuthorizationInterceptor`
 * against `matrix.ts` — see common/authz/interceptor.ts (004, research.md D2).
 *
 * `@Audited({ action: 'audit.queried' })` is channel-gated by construction: the
 * append primitive itself skips channel-gated actions on an automated read
 * (FR-025), so declaring the action here is the whole of T089 — no extra branching
 * belongs in this controller.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { Capability } from '../../common/authz/declare';
import { Audited } from '../../common/audit/interceptor';
import { currentTx } from '../../common/tenant/middleware';
import { resolveWindow, type ServedWindow } from './window';
import { queryAuditEvents } from './audit.repository';
import { decodeCursor, normaliseLimit, toPage } from '../../common/http/pagination';
import { parseActionFilter, parseOptionalString, presentAuditEvent, type AuditEventResponseItem } from './present';

export interface AuditEventsResponse {
  readonly items: readonly AuditEventResponseItem[];
  readonly nextCursor: string | null;
  readonly servedWindow: ServedWindow;
}

@Controller('audit')
export class AuditController {
  @Get('events')
  @Capability('audit.read_own_tenant')
  @Audited({ action: 'audit.queried', targetEntity: 'audit_event' })
  async list(@Query() query: Record<string, unknown>): Promise<AuditEventsResponse> {
    const { from, to, servedWindow } = resolveWindow(query.from, query.to);
    const limit = normaliseLimit(query.limit);
    const cursor = query.cursor ? decodeCursor(String(query.cursor)) : undefined;

    const rows = await queryAuditEvents(currentTx(), {
      from,
      to,
      action: parseActionFilter(query.action),
      targetEntity: parseOptionalString(query.targetEntity),
      targetId: parseOptionalString(query.targetId),
      cursor,
      limit,
    });

    const page = toPage(rows, limit, (row) => ({ occurredAt: row.occurredAt.toISOString(), id: row.id }));

    return {
      items: page.items.map(presentAuditEvent),
      nextCursor: page.nextCursor,
      servedWindow,
    };
  }
}
