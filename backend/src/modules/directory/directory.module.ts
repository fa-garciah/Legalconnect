/**
 * T001 — the firm directory: position catalog + directory entries. Tenant-scoped;
 * extends membership (002) behind its own seam, never modifying it (FR-014).
 */
import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { DirectoryEntryService } from './directory-entry.service';
import { DIRECTORY_ENTRY_REPOSITORY, DbDirectoryEntryRepository } from './directory-entry.repository';
import { PositionController } from './position.controller';
import { PositionService } from './position.service';
import { PositionRepository } from './position.repository';

@Module({
  controllers: [DirectoryController, PositionController],
  providers: [
    DirectoryEntryService,
    { provide: DIRECTORY_ENTRY_REPOSITORY, useClass: DbDirectoryEntryRepository },
    PositionService,
    PositionRepository,
  ],
})
export class DirectoryModule {}
