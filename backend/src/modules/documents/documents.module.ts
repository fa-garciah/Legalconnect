/**
 * T001 — case documents and the document-category catalog. Tenant-scoped, scoped
 * transitively through the case a document belongs to (006's `assigned` resolver,
 * inherited per FR-005/FR-008 — this slice registers no resolver of its own).
 */
import { Module } from '@nestjs/common';
import { OBJECT_STORE_PORT } from '../../common/storage/object-store/object-store.port';
import { S3ObjectStore, type S3ObjectStoreConfig } from '../../common/storage/object-store/s3-object-store';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { DocumentCategoryController } from './categories/document-category.controller';
import { DocumentCategoryService } from './categories/document-category.service';
import { DocumentCategoryRepository } from './categories/document-category.repository';

/**
 * T011 — reads the four `OBJECT_STORE_*` values (research.md D6). Local dev points
 * these at MinIO (docker-compose.yml); production points the same client at real S3
 * in `mx-central-1` (plan.md Constraints, Data Residency) — no code change, only these
 * values.
 */
function objectStoreConfig(): S3ObjectStoreConfig {
  const bucket = process.env.OBJECT_STORE_BUCKET;
  const accessKeyId = process.env.OBJECT_STORE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORE_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('OBJECT_STORE_BUCKET, OBJECT_STORE_ACCESS_KEY_ID and OBJECT_STORE_SECRET_ACCESS_KEY are required');
  }
  return {
    endpoint: process.env.OBJECT_STORE_ENDPOINT,
    region: process.env.OBJECT_STORE_REGION ?? 'mx-central-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.OBJECT_STORE_FORCE_PATH_STYLE === 'true',
  };
}

@Module({
  controllers: [DocumentsController, DocumentCategoryController],
  providers: [
    DocumentsService,
    DocumentsRepository,
    DocumentCategoryService,
    DocumentCategoryRepository,
    {
      provide: OBJECT_STORE_PORT,
      useFactory: () => new S3ObjectStore(objectStoreConfig()),
    },
  ],
})
export class DocumentsModule {}
