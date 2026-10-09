/**
 * 008 — contracts/notes-activity-api.md §5. `GET /tenant/cases/:caseId/activity?month=YYYY-MM`.
 *
 * Not `@Audited` (Decision 4): the feed shows only kinds of change the log already holds, never
 * content, so a read of it discloses nothing the log would need to record.
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { Capability, ScopeTarget } from '../../common/authz/declare';
import { assertUuid } from '../tenant/rfc';
import { ActivityRepository, type ActivityEntry } from './activity.repository';
import { normaliseMonth } from './note-input';

@Controller('tenant/cases/:caseId/activity')
export class ActivityController {
  constructor(private readonly activity: ActivityRepository) {}

  @Get()
  @Capability('case.read_activity')
  @ScopeTarget('caseId')
  async list(
    @Param('caseId') caseId: string,
    @Query('month') rawMonth: unknown,
  ): Promise<{ month: string; items: ActivityEntry[]; truncated: boolean }> {
    const id = assertUuid(caseId, 'case id');
    const month = normaliseMonth(rawMonth) ?? (await this.activity.currentMonth());
    return { month, ...(await this.activity.forCase(id, month)) };
  }
}
