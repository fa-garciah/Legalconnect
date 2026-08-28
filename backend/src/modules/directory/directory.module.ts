/**
 * T001 — the firm directory: position catalog + directory entries. Tenant-scoped;
 * extends membership (002) behind its own seam, never modifying it (FR-014).
 */
import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { DirectoryEntryRepository } from './directory-entry.repository';
import { DirectoryEntryService } from './directory-entry.service';
import { PositionController } from './position.controller';
import { PositionRepository } from './position.repository';
import { PositionService } from './position.service';

@Module({
  controllers: [DirectoryController, PositionController],
  providers: [
    DirectoryEntryRepository,
    DirectoryEntryService,
    PositionRepository,
    PositionService,
  ],
})
export class DirectoryModule {}
