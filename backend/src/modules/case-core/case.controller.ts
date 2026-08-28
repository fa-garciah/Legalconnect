/**
 * T043 — the case surface. contracts/case-api.md §1-§4.
 *
 * **The first routes in this product to resolve at `assigned` scope.** Rows 30 and 32
 * carry `@ScopeTarget('caseId')`, which is what puts the case id on
 * `ScopeRequest.targetId` for `AssignedScopeResolver` to decide about. Without it the
 * resolver fails closed and every caller is refused — and that refusal is byte-identical
 * to a correct one (FR-016), so `tests/contract/scope-target-declared.test.ts` fails the
 * build rather than letting it be discovered in production.
 *
 * Rows 29 and 31 carry no `@ScopeTarget` and must not: the list read is `tenant`-scoped so
 * an unassigned caller gets an empty page instead of a refusal (FR-014), and creation names
 * no case to be assigned to yet (FR-015).
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability, ScopeTarget } from '../../common/authz/declare';
import { decodeCursor } from '../../common/http/pagination';
import { assertUuid } from '../tenant/rfc';
import { CaseService } from './case.service';
import type { CaseRow, CatalogRef } from './case.repository';
import { CaseAssignmentRepository, type TeamMemberRow } from './case-assignment.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

export interface CaseItem {
  readonly id: string;
  readonly fileNumber: string;
  readonly venueCaseReference: string | null;
  readonly client: { readonly id: string; readonly legalName: string; readonly status: string };
  readonly status: CatalogRef;
  readonly matterType: CatalogRef | null;
  readonly venue: CatalogRef | null;
  readonly openedOn: string;
  readonly closedOn: string | null;
}

export interface CaseDetail extends CaseItem {
  readonly team: readonly TeamMemberRow[];
}

export interface CaseListResponse {
  readonly items: readonly CaseItem[];
  readonly nextCursor: string | null;
}

const present = (row: CaseRow): CaseItem => ({
  id: row.id,
  fileNumber: row.fileNumber,
  venueCaseReference: row.venueCaseReference,
  client: row.client,
  status: row.status,
  matterType: row.matterType,
  venue: row.venue,
  openedOn: row.openedOn,
  closedOn: row.closedOn,
});

@Controller('tenant/cases')
export class CaseController {
  constructor(
    private readonly cases: CaseService,
    private readonly assignments: CaseAssignmentRepository,
  ) {}

  /**
   * Row 29 — `tenant` scope, and that is load-bearing rather than an oversight.
   *
   * The scope check permits the call; the result set is filtered by assignment inside the
   * query (`CaseRepository.list`). A caller with no assignments receives `{ items: [] }`
   * with a 200, which 016a renders through its EMPTY-state contract, not its error state.
   * An `assigned`-scoped list could only have refused them.
   *
   * No `@Audited`: spec.md's Resolved Decisions exempt the list read. It returns only rows
   * the caller is already scoped to and discloses no matter's contents; the single-case
   * read below is the access Principle V asks to be recorded.
   */
  @Get()
  @Capability('case.read_list')
  async list(@Query() query: Record<string, unknown>): Promise<CaseListResponse> {
    const cursor = query.cursor ? decodeCursor(String(query.cursor)) : undefined;
    const page = await this.cases.list(query, cursor);
    return { items: page.items.map(present), nextCursor: page.nextCursor };
  }

  /**
   * Row 31 — `tenant`, not `assigned`: there is no case to be assigned to at the moment of
   * creation, which FR-015 names as the one exception to "every route touching a named case
   * declares `assigned`".
   */
  @Post()
  @HttpCode(201)
  @Capability('case.create')
  @Audited({ action: 'case.created', targetEntity: 'case_file' })
  async create(@Body() body: unknown, @Req() req: AuditableRequest): Promise<CaseItem> {
    const row = await this.cases.create(body);
    req.auditTargetId = row.id;
    return present(row);
  }

  /**
   * Row 30 — the first `assigned`-scoped read in the product.
   *
   * A caller not on the team receives `404 not_found`, byte-identical to a case that does
   * not exist and to one belonging to another tenant. Nothing in this handler produces
   * that: `AuthorizationInterceptor` refuses before it runs, and `refusalToHttp` maps the
   * scope refusal through `ASSIGNED_SCOPE_REFUSAL` (004's `refusal.ts`, unchanged by this
   * slice — the mapping was written for exactly this moment).
   *
   * `@Audited` with `case.read`, channel-gated to interactive (FR-023): Principle V
   * requires recording ACCESS to cases, not only modification, and the gate keeps a
   * monitoring job from inflating the log it watches.
   */
  @Get(':caseId')
  @Capability('case.read')
  @ScopeTarget('caseId')
  @Audited({ action: 'case.read', targetEntity: 'case_file' })
  async read(@Param('caseId') caseId: string, @Req() req: AuditableRequest): Promise<CaseDetail> {
    const id = assertUuid(caseId, 'case id');
    const row = await this.cases.read(id);
    // After the read succeeded — a 404 must record nothing, or the log would confirm the
    // existence the 404 exists to hide.
    req.auditTargetId = id;

    // FR-012a is what lets this be a plain read of live assignments with no join to
    // `membership`: revocation closes a member's assignments in its own transaction, so a
    // revoked member holds none and cannot appear here.
    const team = await this.assignments.listLiveByCase(id);
    return { ...present(row), team };
  }

  /** Row 32 — `assigned`. FR-008a derives `closedOn`; the request cannot supply it. */
  @Patch(':caseId/status')
  @HttpCode(200)
  @Capability('case.change_status')
  @ScopeTarget('caseId')
  @Audited({ action: 'case.status_changed', targetEntity: 'case_file' })
  async changeStatus(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<CaseItem> {
    const id = assertUuid(caseId, 'case id');
    req.auditTargetId = id;

    const { row, previous } = await this.cases.changeStatus(id, body);

    // 004/FR-009's shape. `closedOn` is recorded alongside the status because it moved as
    // a consequence rather than as an instruction — reading the entry should show both.
    addAuditMetadata(req as object, {
      status: { from: previous.status.id, to: row.status.id },
      ...(previous.closedOn === row.closedOn
        ? {}
        : { closedOn: { from: previous.closedOn, to: row.closedOn } }),
    });

    return present(row);
  }
}
