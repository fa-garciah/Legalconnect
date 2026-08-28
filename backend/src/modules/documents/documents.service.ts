/**
 * T022, T029, T037, T042 — upload (reserve→commit, research.md D4), read, preview,
 * download, category change, withdraw, restore. FR-001–FR-021.
 */
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { LimitReached, ResourceNotFound, CatalogEntryNotAvailable, AlreadyWithdrawn, NotWithdrawn } from '../../common/http/errors';
import { currentPrincipal } from '../../common/tenant/middleware';
import { assertUploadAllowed } from './upload-validation';
import { DocumentsRepository, type DocumentRow } from './documents.repository';
import {
  OBJECT_STORE_PORT,
  buildObjectKey,
  type ObjectStorePort,
} from '../../common/storage/object-store/object-store.port';

export interface UploadInput {
  readonly buffer: Buffer;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly categoryId?: string | null;
}

export type PreviewFamily = 'pdf' | 'image' | 'converted-pdf' | 'unsupported';

export interface PreviewResult {
  readonly previewUrl: string | null;
  readonly expiresAt: string | null;
  readonly renderAs: PreviewFamily;
  readonly downloadAvailable: boolean;
}

export interface DownloadResult {
  readonly downloadUrl: string;
  readonly expiresAt: string;
  readonly filename: string;
}

const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const OFFICE_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** research.md D5 — preview strategy by file family. */
function previewFamilyFor(mimeType: string): PreviewFamily {
  if (mimeType === 'application/pdf') return 'pdf';
  if (IMAGE_MIME_TYPES.has(mimeType)) return 'image';
  if (OFFICE_MIME_TYPES.has(mimeType)) return 'converted-pdf';
  return 'unsupported';
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly repo: DocumentsRepository,
    @Inject(OBJECT_STORE_PORT) private readonly objectStore: ObjectStorePort,
  ) {}

  async upload(caseId: string, input: UploadInput): Promise<DocumentRow> {
    assertUploadAllowed(input.originalFilename, input.mimeType);

    // Covers the MP/SA short-circuit (006's Decision 2, inherited FR-008): the
    // resolver grants them before checking the case exists at all, so this is what
    // turns "no such case" into the generic 404 rather than a foreign-key violation.
    const caseRow = await this.repo.findCase(caseId);
    if (!caseRow) throw new ResourceNotFound();

    const category =
      input.categoryId != null
        ? await this.repo.findCategory(input.categoryId)
        : await this.repo.findDefaultCategory();
    if (!category || (input.categoryId != null && category.status !== 'active')) {
      throw new CatalogEntryNotAvailable();
    }

    // research.md D3/D4 — the storage check runs against the size THIS upload would
    // add, not only against what is already stored (spec.md FR-013, Edge Cases), and
    // the check-and-reserve is one atomic statement (repository), not a separate
    // read followed by a write — that is what closes the concurrent-upload race.
    const principal = currentPrincipal();
    const limit = principal.plan?.limits.storageBytes ?? null;
    const reserved = await this.repo.reserveStorage(caseRow.tenantId, input.buffer.byteLength, limit);
    if (!reserved) {
      throw new LimitReached({ key: 'storageBytes', value: limit! });
    }

    const id = randomUUID();
    const storageKey = buildObjectKey(caseRow.tenantId, caseId, id);

    let row: DocumentRow;
    try {
      row = await this.repo.insertDocument({
        id,
        caseId,
        tenantId: caseRow.tenantId,
        uploadedByMembershipId: principal.membershipId,
        categoryId: category.id,
        storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.byteLength,
      });
    } catch (error) {
      await this.repo.rollbackReservation(id, caseRow.tenantId, input.buffer.byteLength);
      throw error;
    }

    try {
      await this.objectStore.put({ key: storageKey, body: input.buffer, contentType: input.mimeType });
    } catch (error) {
      // research.md D4 — a failed S3 write leaves no reservation behind.
      await this.repo.rollbackReservation(id, caseRow.tenantId, input.buffer.byteLength);
      throw error;
    }

    return row;
  }

  async listForCase(caseId: string): Promise<readonly DocumentRow[]> {
    return this.repo.listByCase(caseId);
  }

  async preview(caseId: string, id: string): Promise<PreviewResult> {
    const document = await this.repo.findInCase(id, caseId);
    if (!document) throw new ResourceNotFound();

    const family = previewFamilyFor(document.mimeType);
    if (family === 'unsupported') {
      return { previewUrl: null, expiresAt: null, renderAs: 'unsupported', downloadAvailable: true };
    }

    const signed = await this.objectStore.presignGet(document.storageKey);
    return {
      previewUrl: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
      renderAs: family,
      downloadAvailable: true,
    };
  }

  async download(caseId: string, id: string): Promise<DownloadResult> {
    const document = await this.repo.findInCase(id, caseId);
    if (!document) throw new ResourceNotFound();

    const signed = await this.objectStore.presignGet(document.storageKey);
    return { downloadUrl: signed.url, expiresAt: signed.expiresAt.toISOString(), filename: document.originalFilename };
  }

  async changeCategory(caseId: string, id: string, categoryId: string): Promise<{ document: DocumentRow; previousCategoryId: string }> {
    const existing = await this.repo.findInCase(id, caseId);
    if (!existing) throw new ResourceNotFound();

    const category = await this.repo.findCategory(categoryId);
    if (!category || category.status !== 'active') throw new CatalogEntryNotAvailable();

    const document = await this.repo.updateCategory(id, categoryId);
    return { document, previousCategoryId: existing.categoryId };
  }

  async withdraw(caseId: string, id: string): Promise<DocumentRow> {
    const existing = await this.repo.findInCase(id, caseId);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'withdrawn') throw new AlreadyWithdrawn();
    return this.repo.withdraw(id);
  }

  async restore(caseId: string, id: string): Promise<DocumentRow> {
    const existing = await this.repo.findInCase(id, caseId);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'active') throw new NotWithdrawn();
    return this.repo.restore(id);
  }
}
