import { Module } from '@nestjs/common';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesRepository } from './time-entries.repository';
import { TimeEntriesService } from './time-entries.service';
import { TimesheetController } from './timesheet.controller';

/**
 * 009-time-tracking. Tenant-scoped; writes reach a matter through 006's `assigned` resolver, reads
 * are the caller's own entries on matters they still reach.
 */
@Module({
  controllers: [TimeEntriesController, TimesheetController],
  providers: [TimeEntriesService, TimeEntriesRepository],
})
export class TimeEntriesModule {}
