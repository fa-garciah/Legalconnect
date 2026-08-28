/**
 * T026 — the case catalogs' surface. contracts/catalog-api.md.
 *
 * Four routes serving three catalogs, parameterised by the `{catalog}` path segment.
 * `@Capability` is decided by `AuthorizationInterceptor` against `matrix.ts` (004) —
 * nothing in this file checks an archetype. `@Audited` declares the action; the audit
 * interceptor appends it inside the same transaction the mutation runs in, so a failed
 * append rolls the change back with it (001/FR-017).
 *
 * No `@ScopeTarget`: rows 34 and 35 are `tenant`-scoped, and the build gate in
 * `tests/contract/scope-target-declared.test.ts` refuses an inert declaration here.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../../common/audit/interceptor';
import { Capability } from '../../../common/authz/declare';
import { ResourceNotFound } from '../../../common/http/errors';
import { assertUuid } from '../../tenant/rfc';
import { CaseCatalogService } from './case-catalog.service';
import {
  CATALOGS,
  isCatalogSegment,
  supportsIsClosing,
  type CatalogEntryRow,
  type CatalogSegment,
} from './case-catalog.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

/** contracts/catalog-api.md §1 — the wire shape. */
export interface CatalogEntryItem {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
  readonly isClosing?: boolean;
  readonly retiredAt?: string | null;
}

const present = (row: CatalogEntryRow): CatalogEntryItem => ({
  id: row.id,
  name: row.name,
  status: row.status,
  ...(row.isClosing === undefined ? {} : { isClosing: row.isClosing }),
  ...(row.retiredAt === null ? {} : { retiredAt: row.retiredAt }),
});

/**
 * An unknown segment is the same generic 404 an unknown route already gives, so probing
 * the path reveals nothing about which catalogs exist.
 */
function assertSegment(raw: string): CatalogSegment {
  if (!isCatalogSegment(raw)) throw new ResourceNotFound();
  return raw;
}

@Controller('tenant/case-catalogs')
export class CaseCatalogController {
  constructor(private readonly catalogs: CaseCatalogService) {}

  @Get(':catalog')
  @Capability('case.read_catalog')
  async list(@Param('catalog') catalog: string): Promise<{ items: readonly CatalogEntryItem[] }> {
    const segment = assertSegment(catalog);
    const rows = await this.catalogs.list(segment);
    return { items: rows.map(present) };
  }

  @Post(':catalog')
  @HttpCode(201)
  @Capability('case.manage_catalog')
  @Audited({ action: 'case.catalog_entry_created', targetEntity: 'unknown' })
  async create(
    @Param('catalog') catalog: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<CatalogEntryItem> {
    const segment = assertSegment(catalog);
    const input = (body ?? {}) as { name?: unknown; isClosing?: unknown };

    const row = await this.catalogs.create(segment, input.name, input.isClosing);

    // Set AFTER the create, so a refused request records nothing. One action serves all
    // three catalogs and the target entity is what distinguishes them (research.md D8).
    req.auditTargetId = row.id;
    addAuditMetadata(req as object, { catalog: CATALOGS[segment] });
    return present(row);
  }

  /**
   * FR-008a — the one mutable field on any catalog entry, and only on case statuses.
   * Names are not editable: 017 established retire-and-recreate for `position`, and
   * nothing here justifies diverging.
   */
  @Patch(':catalog/:id')
  @HttpCode(200)
  @Capability('case.manage_catalog')
  @Audited({ action: 'case.catalog_entry_updated', targetEntity: 'case_status' })
  async update(
    @Param('catalog') catalog: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<CatalogEntryItem> {
    const segment = assertSegment(catalog);
    if (!supportsIsClosing(segment)) throw new ResourceNotFound();

    const entryId = assertUuid(id, 'catalog entry id');
    req.auditTargetId = entryId;

    const input = (body ?? {}) as { isClosing?: unknown };
    const { row, previous } = await this.catalogs.setIsClosing(segment, entryId, input.isClosing);

    // 004/FR-009's shape, reused for the analogous change.
    addAuditMetadata(req as object, { from: previous, to: row.isClosing });
    return present(row);
  }

  @Patch(':catalog/:id/retire')
  @HttpCode(200)
  @Capability('case.manage_catalog')
  @Audited({ action: 'case.catalog_entry_retired', targetEntity: 'unknown' })
  async retire(
    @Param('catalog') catalog: string,
    @Param('id') id: string,
    @Req() req: AuditableRequest,
  ): Promise<CatalogEntryItem> {
    const segment = assertSegment(catalog);
    const entryId = assertUuid(id, 'catalog entry id');
    // Assigned before the call so a refusal (404/409) throws before the append — a
    // retirement that did not happen must not appear in the log.
    req.auditTargetId = entryId;

    const row = await this.catalogs.retire(segment, entryId);
    addAuditMetadata(req as object, { catalog: CATALOGS[segment] });
    return present(row);
  }
}
