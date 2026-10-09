/**
 * 009 — contracts/time-entries-api.md §4–§8: every write that names a matter.
 *
 * Nested under `/tenant/cases/:caseId` on purpose (009 Decision 9). `@ScopeTarget('caseId')` hands
 * the URL's matter to 006's `assigned` resolver, so "may this person record time on this matter"
 * is answered by the global interceptor before any line here runs — `MP` unrestricted, everybody
 * else only with a live assignment, and an unreachable matter is the same `404` as a missing one.
 *
 * One audit row per mutation (FR-014). Metadata carries field NAMES at most — never a description,
 * a duration or a date, any of which may say more about a client's matter than the log should.
 */
import { Body, Controller, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability, ScopeTarget } from '../../common/authz/declare';
import { assertUuid } from '../tenant/rfc';
import { TimeEntriesService } from './time-entries.service';
import type { EntryRow, RunningTimerRow } from './time-entries.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@Controller('tenant/cases/:caseId/time-entries')
export class TimeEntriesController {
  constructor(private readonly time: TimeEntriesService) {}

  @Post()
  @HttpCode(201)
  @Capability('time.log')
  @ScopeTarget('caseId')
  @Audited({ action: 'time_entry.logged', targetEntity: 'time_entry' })
  async log(@Param('caseId') caseId: string, @Body() body: unknown, @Req() req: AuditableRequest): Promise<EntryRow> {
    const entry = await this.time.logManual(assertUuid(caseId, 'case id'), body);
    req.auditTargetId = entry.id;
    return entry;
  }

  @Post('timer')
  @HttpCode(201)
  @Capability('time.log')
  @ScopeTarget('caseId')
  @Audited({ action: 'time_entry.timer_started', targetEntity: 'time_entry' })
  async start(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<RunningTimerRow> {
    const timer = await this.time.startTimer(assertUuid(caseId, 'case id'), body);
    req.auditTargetId = timer.id;
    return timer;
  }

  @Post('timer/stop')
  @HttpCode(201)
  @Capability('time.log')
  @ScopeTarget('caseId')
  @Audited({ action: 'time_entry.timer_stopped', targetEntity: 'time_entry' })
  async stop(@Param('caseId') caseId: string, @Body() body: unknown, @Req() req: AuditableRequest): Promise<EntryRow> {
    const entry = await this.time.stopTimer(assertUuid(caseId, 'case id'), body);
    req.auditTargetId = entry.id;
    return entry;
  }

  @Patch(':entryId')
  @HttpCode(200)
  @Capability('time.correct_own')
  @ScopeTarget('caseId')
  @Audited({ action: 'time_entry.corrected', targetEntity: 'time_entry' })
  async correct(
    @Param('caseId') caseId: string,
    @Param('entryId') entryId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<EntryRow> {
    const id = assertUuid(entryId, 'entry id');
    const { entry, changed } = await this.time.correct(assertUuid(caseId, 'case id'), id, body);
    req.auditTargetId = id;
    // FR-014: which fields changed, never their values.
    addAuditMetadata(req as object, { changed });
    return entry;
  }

  @Post(':entryId/void')
  @HttpCode(200)
  @Capability('time.correct_own')
  @ScopeTarget('caseId')
  @Audited({ action: 'time_entry.voided', targetEntity: 'time_entry' })
  async void(
    @Param('caseId') caseId: string,
    @Param('entryId') entryId: string,
    @Req() req: AuditableRequest,
  ): Promise<{ id: string }> {
    const id = assertUuid(entryId, 'entry id');
    const result = await this.time.void(assertUuid(caseId, 'case id'), id);
    req.auditTargetId = id;
    return result;
  }
}
