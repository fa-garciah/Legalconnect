/**
 * T036 — contracts/document-api.md §8-10. The document-category catalog surface.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Audited } from '../../../common/audit/interceptor';
import { Capability } from '../../../common/authz/declare';
import { assertUuid } from '../../tenant/rfc';
import { DocumentCategoryService } from './document-category.service';
import type { DocumentCategoryRow } from './document-category.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@Controller('tenant/document-categories')
export class DocumentCategoryController {
  constructor(private readonly categories: DocumentCategoryService) {}

  @Post()
  @HttpCode(201)
  @Capability('document.manage_catalog')
  @Audited({ action: 'document_category.created', targetEntity: 'document_category' })
  async create(@Body() body: unknown, @Req() req: AuditableRequest): Promise<DocumentCategoryRow> {
    const input = (body ?? {}) as { name?: unknown };
    const row = await this.categories.create(input.name);
    req.auditTargetId = row.id;
    return row;
  }

  @Patch(':id/retire')
  @HttpCode(200)
  @Capability('document.manage_catalog')
  @Audited({ action: 'document_category.retired', targetEntity: 'document_category' })
  async retire(@Param('id') id: string, @Req() req: AuditableRequest): Promise<DocumentCategoryRow> {
    const categoryId = assertUuid(id, 'category id');
    req.auditTargetId = categoryId;
    return this.categories.retire(categoryId);
  }

  @Get()
  @Capability('document.read_catalog')
  async list(): Promise<{ items: readonly DocumentCategoryRow[] }> {
    return { items: await this.categories.list() };
  }
}
