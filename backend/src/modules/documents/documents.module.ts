/**
 * T001 — case documents and the document-category catalog. Tenant-scoped, scoped
 * transitively through the case a document belongs to (006's `assigned` resolver,
 * inherited per FR-005/FR-008 — this slice registers no resolver of its own).
 */
import { Module } from '@nestjs/common';
import { OBJECT_STORE_PORT } from '../../common/storage/object-store/object-store.port';
import { objectStoreConfigFromEnv } from '../../common/storage/object-store/object-store.config';
import { S3ObjectStore } from '../../common/storage/object-store/s3-object-store';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { DocumentCategoryController } from './categories/document-category.controller';
import { DocumentCategoryService } from './categories/document-category.service';
import { DocumentCategoryRepository } from './categories/document-category.repository';

/**
 * T011 read the four `OBJECT_STORE_*` values here (research.md D6). `022`/T008 moved that
 * function to `common/storage/object-store/object-store.config.ts` so the demo seed reads
 * the same configuration the application does, rather than a second copy that could drift.
 * Local dev points these at MinIO (docker-compose.yml); production points the same client
 * at real S3 in `mx-central-1` — no code change, only these values.
 */
@Module({
  controllers: [DocumentsController, DocumentCategoryController],
  providers: [
    DocumentsService,
    DocumentsRepository,
    DocumentCategoryService,
    DocumentCategoryRepository,
    {
      provide: OBJECT_STORE_PORT,
      // The config function is PASSED, not called. `S3ObjectStore` invokes it on first
      // use, so a missing `OBJECT_STORE_*` value fails the one request that needs object
      // storage rather than aborting application startup — which, called eagerly here,
      // took down every test in the repo that boots `AppModule` with an unreadable
      // `Worker exited unexpectedly`. See the note on `S3ObjectStore`'s constructor.
      useFactory: () => new S3ObjectStore(() => objectStoreConfigFromEnv()),
    },
  ],
})
export class DocumentsModule {}
