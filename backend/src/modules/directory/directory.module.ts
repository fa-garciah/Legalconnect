/**
 * T001 — the firm directory: position catalog + directory entries. Tenant-scoped;
 * extends membership (002) behind its own seam, never modifying it (FR-014).
 */
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  providers: [],
})
export class DirectoryModule {}
