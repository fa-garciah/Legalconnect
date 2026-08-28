/**
 * contracts/document-api.md — case documents. Every document-specific route is
 * nested under its case (`/tenant/cases/:caseId/documents/...`), never a flat
 * `/tenant/documents/:id` shape — `@ScopeTarget('caseId')` reads a route parameter
 * directly and has no async-lookup extension point (data-model.md, "Scope
 * resolution").
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability, ScopeTarget } from '../../common/authz/declare';
import { ValidationFailed } from '../../common/http/errors';
import { assertUuid } from '../tenant/rfc';
import { DocumentsService } from './documents.service';
import type { DocumentRow } from './documents.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

interface UploadedFileShape {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
}

function present(row: DocumentRow) {
  return {
    id: row.id,
    caseId: row.caseId,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedByMembershipId: row.uploadedByMembershipId,
    uploadedAt: row.uploadedAt,
    status: row.status,
  };
}

@Controller('tenant/cases/:caseId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(201)
  @Capability('document.upload')
  @ScopeTarget('caseId')
  @Audited({ action: 'document.uploaded', targetEntity: 'document' })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('caseId') caseId: string,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ) {
    const id = assertUuid(caseId, 'case id');
    if (!file) throw new ValidationFailed('A file is required.');
    const input = (body ?? {}) as { categoryId?: unknown };
    const categoryId =
      typeof input.categoryId === 'string' && input.categoryId.length > 0
        ? assertUuid(input.categoryId, 'category id')
        : null;

    const row = await this.documents.upload(id, {
      buffer: file.buffer,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      categoryId,
    });
    req.auditTargetId = row.id;
    return present(row);
  }

  @Get()
  @Capability('document.read')
  @ScopeTarget('caseId')
  async list(@Param('caseId') caseId: string): Promise<{ items: ReturnType<typeof present>[] }> {
    const id = assertUuid(caseId, 'case id');
    const rows = await this.documents.listForCase(id);
    return { items: rows.map(present) };
  }

  @Get(':id/preview')
  @Capability('document.read')
  @ScopeTarget('caseId')
  @Audited({ action: 'document.previewed', targetEntity: 'document' })
  async preview(
    @Param('caseId') caseId: string,
    @Param('id') documentId: string,
    @Req() req: AuditableRequest,
  ) {
    const cid = assertUuid(caseId, 'case id');
    const id = assertUuid(documentId, 'document id');
    req.auditTargetId = id;
    return this.documents.preview(cid, id);
  }

  @Get(':id/download')
  @Capability('document.download')
  @ScopeTarget('caseId')
  @Audited({ action: 'document.downloaded', targetEntity: 'document' })
  async download(
    @Param('caseId') caseId: string,
    @Param('id') documentId: string,
    @Req() req: AuditableRequest,
  ) {
    const cid = assertUuid(caseId, 'case id');
    const id = assertUuid(documentId, 'document id');
    req.auditTargetId = id;
    return this.documents.download(cid, id);
  }

  @Patch(':id/category')
  @HttpCode(200)
  @Capability('document.change_category')
  @ScopeTarget('caseId')
  @Audited({ action: 'document.category_changed', targetEntity: 'document' })
  async changeCategory(
    @Param('caseId') caseId: string,
    @Param('id') documentId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ) {
    const cid = assertUuid(caseId, 'case id');
    const id = assertUuid(documentId, 'document id');
    const input = (body ?? {}) as { categoryId?: unknown };
    if (typeof input.categoryId !== 'string') throw new ValidationFailed('categoryId is required.');
    const categoryId = assertUuid(input.categoryId, 'category id');

    req.auditTargetId = id;
    const { document, previousCategoryId } = await this.documents.changeCategory(cid, id, categoryId);
    addAuditMetadata(req as object, { from: previousCategoryId, to: categoryId });
    return present(document);
  }

  @Patch(':id/withdraw')
  @HttpCode(200)
  @Capability('document.withdraw')
  @ScopeTarget('caseId')
  @Audited({ action: 'document.withdrawn', targetEntity: 'document' })
  async withdraw(
    @Param('caseId') caseId: string,
    @Param('id') documentId: string,
    @Req() req: AuditableRequest,
  ) {
    const cid = assertUuid(caseId, 'case id');
    const id = assertUuid(documentId, 'document id');
    req.auditTargetId = id;
    return present(await this.documents.withdraw(cid, id));
  }

  @Patch(':id/restore')
  @HttpCode(200)
  @Capability('document.restore')
  @ScopeTarget('caseId')
  @Audited({ action: 'document.restored', targetEntity: 'document' })
  async restore(
    @Param('caseId') caseId: string,
    @Param('id') documentId: string,
    @Req() req: AuditableRequest,
  ) {
    const cid = assertUuid(caseId, 'case id');
    const id = assertUuid(documentId, 'document id');
    req.auditTargetId = id;
    return present(await this.documents.restore(cid, id));
  }
}
