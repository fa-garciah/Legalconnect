import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityRepository } from './activity.repository';
import { NotesController } from './notes.controller';
import { NotesRepository } from './notes.repository';
import { NotesService } from './notes.service';

/**
 * 008-notes-and-activity. Tenant-scoped; every route reaches a matter through 006's `assigned`
 * resolver.
 */
@Module({
  controllers: [NotesController, ActivityController],
  providers: [NotesService, NotesRepository, ActivityRepository],
})
export class NotesModule {}
