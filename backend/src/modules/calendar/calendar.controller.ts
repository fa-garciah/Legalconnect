/**
 * 013 T008 — contracts/calendar-api.md. Two capabilities, both `tenant` scope (rows 44–45);
 * case-linked visibility is the repository's assignment predicate (FR-006), and a write naming or
 * touching an unreachable case answers 404 from the service (FR-007). Nothing here checks an
 * archetype except to decide the MP/SA "unrestricted" view, exactly as 006's case list does.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { assertUuid } from '../tenant/rfc';
import { CalendarService } from './calendar.service';
import type { EventRow } from './calendar.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@Controller('tenant/calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('events')
  @Capability('calendar.read')
  async list(@Query() query: Record<string, unknown>): Promise<{ items: readonly EventRow[] }> {
    return { items: await this.calendar.list(query) };
  }

  @Get('reminders')
  @Capability('calendar.read')
  async reminders(): Promise<{ items: readonly EventRow[] }> {
    return { items: await this.calendar.reminders() };
  }

  @Post('events')
  @HttpCode(201)
  @Capability('calendar.manage')
  @Audited({ action: 'calendar_event.created', targetEntity: 'calendar_event' })
  async create(@Body() body: unknown, @Req() req: AuditableRequest): Promise<EventRow> {
    const event = await this.calendar.create(body);
    req.auditTargetId = event.id;
    return event;
  }

  @Patch('events/:id')
  @HttpCode(200)
  @Capability('calendar.manage')
  @Audited({ action: 'calendar_event.updated', targetEntity: 'calendar_event' })
  async update(@Param('id') id: string, @Body() body: unknown, @Req() req: AuditableRequest): Promise<EventRow> {
    const eventId = assertUuid(id, 'event id');
    const { event, changed } = await this.calendar.update(eventId, body);
    req.auditTargetId = eventId;
    // FR-009: which fields changed, never their values — a title or description may name a client.
    addAuditMetadata(req as object, { changed });
    return event;
  }

  @Patch('events/:id/cancel')
  @HttpCode(200)
  @Capability('calendar.manage')
  @Audited({ action: 'calendar_event.cancelled', targetEntity: 'calendar_event' })
  async cancel(@Param('id') id: string, @Req() req: AuditableRequest): Promise<EventRow> {
    const eventId = assertUuid(id, 'event id');
    const event = await this.calendar.cancel(eventId);
    req.auditTargetId = eventId;
    return event;
  }
}
