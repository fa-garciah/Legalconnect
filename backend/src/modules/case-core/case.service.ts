/**
 * T042 — the case register's rules. 006/FR-005 to FR-008a.
 *
 * Three things live here and nowhere else: the client and catalog validation a new case
 * must pass, the file-number collision mapping, and FR-008a's closure derivation.
 */
import { Injectable } from '@nestjs/common';
import {
  CatalogEntryNotAvailable,
  ClientNotAvailable,
  FileNumberAlreadyUsed,
  ResourceNotFound,
  SameStatus,
  ValidationFailed,
} from '../../common/http/errors';
import { normaliseLimit, type Cursor, type Page } from '../../common/http/pagination';
import { currentPrincipal } from '../../common/tenant/middleware';
import { CaseRepository, type CaseRow } from './case.repository';
import { ClientRepository } from './client.repository';
import { CaseCatalogRepository } from './catalogs/case-catalog.repository';

const UNIQUE_VIOLATION = '23505';

/**
 * Finds the PostgreSQL SQLSTATE, walking the `cause` chain — Drizzle wraps driver errors
 * in its own type, so matching only the top level looks correct, compiles, and never
 * fires. 001's `ProvisionService` learned this for tenant RFCs; the same shape applies.
 */
function sqlstateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function assertFileNumber(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('A file number is required.');
  const value = raw.trim();
  if (value.length === 0) throw new ValidationFailed('A file number is required.');
  if (value.length > 60) throw new ValidationFailed('The file number is too long.');
  return value;
}

export function normaliseOptionalText(raw: unknown, field: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new ValidationFailed(`${field} must be a string or null.`);
  const value = raw.trim();
  return value.length === 0 ? null : value;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normaliseOptionalDate(raw: unknown, field: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || !ISO_DATE.test(raw)) {
    throw new ValidationFailed(`${field} must be a date in YYYY-MM-DD form.`);
  }
  return raw;
}

/**
 * 019 — the shape of a uuid, for the two catalog filters.
 *
 * `assertUuidish` below checks only that a string is non-empty, which is enough for a body
 * field whose value is looked up and refused if absent. A *filter* is different: an id that
 * does not exist is deliberately NOT a refusal (contract §4), so a malformed value would
 * otherwise sail past validation and reach the `::uuid` cast, where Postgres raises and the
 * caller gets a 500 for what is plainly a bad request.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An optional uuid-shaped filter value. Absent stays absent; malformed is a `400`.
 *
 * Shape only — whether the id exists, or belongs to this firm, is not asked. Answering that
 * would let a caller enumerate a firm's catalog by the difference between two status codes.
 */
function optionalUuidFilter(raw: unknown, field: string): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = String(raw).trim();
  if (value.length === 0) return undefined;
  if (!UUID_SHAPE.test(value)) throw new ValidationFailed(`${field} must be a valid id.`);
  return value;
}

/**
 * The free-text filter. Trimmed, and **whitespace-only is absent rather than a filter
 * matching nothing** — clearing the search box must restore the register, not empty it.
 */
function optionalSearch(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assertUuidish(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ValidationFailed(`${field} is required.`);
  }
  return raw.trim();
}

@Injectable()
export class CaseService {
  constructor(
    private readonly cases: CaseRepository,
    private readonly clients: ClientRepository,
    private readonly catalogs: CaseCatalogRepository,
  ) {}

  /**
   * FR-014, Decision 2. `MP` and `SA` read the whole tenant's caseload; every other
   * archetype sees only the matters they are on. The exemption is read from the principal
   * here for the same reason the resolver reads it there — one rule, expressed twice
   * because a boolean and a row filter are genuinely different shapes (research.md D3).
   */
  async list(query: Record<string, unknown>, cursor?: Cursor): Promise<Page<CaseRow>> {
    const principal = currentPrincipal();
    return this.cases.list({
      limit: normaliseLimit(query.limit),
      cursor,
      unrestricted: principal.archetype === 'MP' || principal.archetype === 'SA',
      membershipId: principal.membershipId,
      // 019's three filters. They narrow the caller's own register and never widen it —
      // `unrestricted` above is what decides its extent, and nothing here touches that.
      q: optionalSearch(query.q),
      matterTypeId: optionalUuidFilter(query.matterTypeId, 'matterTypeId'),
      venueId: optionalUuidFilter(query.venueId, 'venueId'),
    });
  }

  /**
   * The scope resolver has already decided whether this caller may read this case — a
   * refusal never reaches here. A `null` at this point therefore means the case genuinely
   * does not exist, and the generic not-found it produces is byte-identical to the scope
   * refusal by design (FR-016).
   */
  async read(id: string): Promise<CaseRow> {
    const row = await this.cases.findById(id);
    if (!row) throw new ResourceNotFound();
    return row;
  }

  async create(body: unknown): Promise<CaseRow> {
    const input = (body ?? {}) as Record<string, unknown>;

    const clientId = assertUuidish(input.clientId, 'clientId');
    const caseStatusId = assertUuidish(input.caseStatusId, 'caseStatusId');
    const fileNumber = assertFileNumber(input.fileNumber);
    const venueCaseReference = normaliseOptionalText(input.venueCaseReference, 'venueCaseReference');
    const openedOn = normaliseOptionalDate(input.openedOn, 'openedOn');

    // FR-008a — `closedOn` is derived, never supplied. Accepting it would create a second
    // way for the status and the date to disagree.
    if (input.closedOn !== undefined) {
      throw new ValidationFailed('closedOn is derived from the case status and cannot be set.');
    }

    // FR-004. One refusal for inactive, foreign and absent alike — a caller must not be
    // able to tell them apart, because the second is a cross-tenant existence probe.
    const client = await this.clients.findActiveById(clientId);
    if (!client) throw new ClientNotAvailable();

    const status = await this.catalogs.findActiveById('case-statuses', caseStatusId);
    if (!status) throw new CatalogEntryNotAvailable();

    const matterTypeId = await this.resolveOptionalCatalog(input.matterTypeId, 'matter-types');
    const venueId = await this.resolveOptionalCatalog(input.venueId, 'venues');

    try {
      return await this.cases.insert({
        clientId,
        fileNumber,
        venueCaseReference,
        caseStatusId,
        matterTypeId,
        venueId,
        openedOn,
        // FR-008a from the very first write: a case opened directly into a closing status
        // is closed, and one opened into any other status is not.
        closedOn: status.isClosing === true ? (openedOn ?? todayIso()) : null,
      });
    } catch (error) {
      // Mapped from the DATABASE's unique violation, not from a prior existence check. A
      // read-then-write passes a sequential test and still lets two concurrent callers
      // both succeed, because both would read "available" (001's ProvisionService, same
      // argument for tenant RFCs).
      if (sqlstateOf(error) === UNIQUE_VIOLATION) throw new FileNumberAlreadyUsed();
      throw error;
    }
  }

  /**
   * FR-008a. The single place `closedOn` moves, in both directions.
   *
   * Moving to a status the firm marked as ending a matter stamps today's date; moving to
   * any other status clears it. Which statuses end a matter is the firm's own declaration
   * on its own catalog — the product never infers it from a name it did not choose.
   */
  async changeStatus(
    id: string,
    body: unknown,
  ): Promise<{ readonly row: CaseRow; readonly previous: CaseRow }> {
    const input = (body ?? {}) as Record<string, unknown>;

    if (input.closedOn !== undefined) {
      throw new ValidationFailed('closedOn is derived from the case status and cannot be set.');
    }

    const caseStatusId = assertUuidish(input.caseStatusId, 'caseStatusId');

    const previous = await this.cases.findById(id);
    if (!previous) throw new ResourceNotFound();
    // Refused rather than silently accepted, so the audit log never gains a no-op change.
    if (previous.status.id === caseStatusId) throw new SameStatus();

    const status = await this.catalogs.findActiveById('case-statuses', caseStatusId);
    if (!status) throw new CatalogEntryNotAvailable();

    // Re-stamped rather than preserved when moving between two closing statuses: the date
    // records when the matter reached the status it now holds, and carrying an older one
    // forward would attribute the closure to the wrong moment.
    const closedOn = status.isClosing === true ? todayIso() : null;

    const row = await this.cases.updateStatus(id, caseStatusId, closedOn);
    if (!row) throw new ResourceNotFound();
    return { row, previous };
  }

  /**
   * FR-005 — optional, but if named it must be an ACTIVE entry of this tenant's own
   * catalog. One refusal for retired, foreign and absent, and it does not say WHICH of the
   * three ids was at fault: naming the field would turn one probe into three.
   */
  private async resolveOptionalCatalog(
    raw: unknown,
    segment: 'matter-types' | 'venues',
  ): Promise<string | null> {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw !== 'string') throw new CatalogEntryNotAvailable();

    const entry = await this.catalogs.findActiveById(segment, raw.trim());
    if (!entry) throw new CatalogEntryNotAvailable();
    return entry.id;
  }
}

/**
 * The application clock, used only for a closure date. Deliberately not the database's:
 * `closed_on` is a `date`, and a case closed at 23:50 in Mexico City should read as that
 * day rather than the next one UTC. The server runs in the firm's own region (Constitution,
 * Data Residency), so the process clock is the firm's clock.
 */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
