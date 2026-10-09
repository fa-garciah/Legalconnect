/**
 * 009 — contracts/time-entries-api.md §1–§3: the routes that name no matter.
 *
 * A separate controller from `time-entries.controller.ts` so that every route there carries a
 * `:caseId` for 006's resolver, and every route here is `tenant`-scoped and narrowed by the
 * repository to the caller's own rows (009/FR-009, FR-008). `scope-target-declared.test.ts` holds
 * both halves to that.
 *
 * Reads are not audited (009 Decision 8): the only reader of an entry is the person who wrote it.
 */
import { Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { Audited } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { TimeEntriesService, type Timesheet } from './time-entries.service';
import type { RunningTimerRow } from './time-entries.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@Controller('tenant/time-entries')
export class TimesheetController {
  constructor(private readonly time: TimeEntriesService) {}

  @Get()
  @Capability('time.read_own')
  async timesheet(@Query() query: Record<string, unknown>): Promise<Timesheet> {
    return this.time.timesheet(query);
  }

  @Get('timer')
  @Capability('time.read_own')
  async timer(): Promise<{ timer: RunningTimerRow | null }> {
    return { timer: await this.time.runningTimer() };
  }

  @Post('timer/discard')
  @HttpCode(200)
  @Capability('time.discard_timer')
  @Audited({ action: 'time_entry.timer_discarded', targetEntity: 'time_entry' })
  async discard(@Req() req: AuditableRequest): Promise<{ id: string }> {
    const result = await this.time.discardTimer();
    req.auditTargetId = result.id;
    return result;
  }
}
