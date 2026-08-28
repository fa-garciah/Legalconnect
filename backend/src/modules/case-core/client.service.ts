/**
 * T035 — the client register's rules. 006/FR-002 to FR-004a.
 *
 * Four things live here and nowhere else: name and kind validation, `kind` immutability,
 * the frozen-record rule for a withdrawn client, and restoration.
 */
import { Injectable } from '@nestjs/common';
import {
  ClientAlreadyActive,
  ClientAlreadyDeactivated,
  ResourceNotFound,
  ValidationFailed,
} from '../../common/http/errors';
import { normaliseLimit, type Cursor, type Page } from '../../common/http/pagination';
import { ClientRepository, type ClientRow } from './client.repository';

const KINDS = ['organization', 'person'] as const;
type ClientKind = (typeof KINDS)[number];

export function assertLegalName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('A legal name is required.');
  const value = raw.trim();
  if (value.length === 0) throw new ValidationFailed('A legal name is required.');
  if (value.length > 250) throw new ValidationFailed('The legal name is too long.');
  return value;
}

export function assertKind(raw: unknown): ClientKind {
  if (typeof raw !== 'string' || !(KINDS as readonly string[]).includes(raw)) {
    throw new ValidationFailed('kind must be organization or person.');
  }
  return raw as ClientKind;
}

/**
 * FR-002 — nullable by requirement, and deliberately unvalidated in shape.
 *
 * 001's `normaliseRfc` is for TENANT RFCs, where the value identifies the firm being
 * billed and a malformed one is a provisioning error. A client's RFC becomes load-bearing
 * when CFDI ships; validating its form now would refuse records a firm has legitimately
 * not finished collecting, which is the intake this slice exists to make possible.
 */
export function normaliseClientRfc(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new ValidationFailed('rfc must be a string or null.');
  const value = raw.trim().toUpperCase();
  if (value.length === 0) return null;
  if (value.length > 13) throw new ValidationFailed('The RFC is too long.');
  return value;
}

/** FR-002a — a whitespace-only filter is absent, not a filter that matches nothing. */
export function normaliseNameFilter(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length === 0 ? undefined : value;
}

export function normaliseStatusFilter(raw: unknown): 'active' | 'inactive' | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (raw === 'active' || raw === 'inactive') return raw;
  throw new ValidationFailed('status must be active or inactive.');
}

@Injectable()
export class ClientService {
  constructor(private readonly clients: ClientRepository) {}

  async list(query: Record<string, unknown>, cursor?: Cursor): Promise<Page<ClientRow>> {
    return this.clients.list({
      limit: normaliseLimit(query.limit),
      cursor,
      nameFilter: normaliseNameFilter(query.q),
      statusFilter: normaliseStatusFilter(query.status),
    });
  }

  async create(body: unknown): Promise<ClientRow> {
    const input = (body ?? {}) as { kind?: unknown; legalName?: unknown; rfc?: unknown };
    return this.clients.insert({
      kind: assertKind(input.kind),
      legalName: assertLegalName(input.legalName),
      rfc: normaliseClientRfc(input.rfc),
    });
  }

  async update(
    id: string,
    body: unknown,
  ): Promise<{ readonly row: ClientRow; readonly previous: ClientRow }> {
    const input = (body ?? {}) as { kind?: unknown; legalName?: unknown; rfc?: unknown };

    // Refused rather than ignored. Silently dropping it would let a caller believe they
    // had changed something they had not, and the mistake would surface much later as a
    // billing slice reading a `kind` nobody meant.
    if (input.kind !== undefined) {
      throw new ValidationFailed('A client’s kind cannot be changed.');
    }

    // A foreign client is invisible under RLS, so this is the generic not-found every
    // cross-tenant reach in this system answers with (001/FR-008).
    const previous = await this.clients.findById(id);
    if (!previous) throw new ResourceNotFound();
    // A withdrawn client's record is frozen; correcting it means restoring it first.
    if (previous.status === 'inactive') throw new ClientAlreadyDeactivated();

    const fields: { legalName?: string; rfc?: string | null } = {};
    if (input.legalName !== undefined) fields.legalName = assertLegalName(input.legalName);
    if (input.rfc !== undefined) fields.rfc = normaliseClientRfc(input.rfc);

    const row = await this.clients.update(id, fields);
    // Lost a race with a concurrent deactivation — the same refusal the pre-check raises.
    if (!row) throw new ClientAlreadyDeactivated();
    return { row, previous };
  }

  /**
   * FR-003, FR-004. Succeeds regardless of how many live cases reference the client, and
   * every one of them keeps resolving it (FR-008). What withdrawal prevents is FUTURE case
   * creation, enforced in `CaseService`.
   */
  async deactivate(id: string): Promise<ClientRow> {
    const existing = await this.clients.findById(id);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'inactive') throw new ClientAlreadyDeactivated();

    const row = await this.clients.deactivate(id);
    if (!row) throw new ClientAlreadyDeactivated();
    return row;
  }

  /**
   * FR-004a. Governed by the capability that withdraws (row 28), so this adds no matrix
   * row and no new permission question.
   *
   * Without it a mis-click permanently bars a party from ever having another matter opened
   * against them, and the only remedy is a duplicate record — which this slice explicitly
   * will not merge, so the duplicate would be permanent too.
   */
  async reactivate(id: string): Promise<ClientRow> {
    const existing = await this.clients.findById(id);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'active') throw new ClientAlreadyActive();

    const row = await this.clients.reactivate(id);
    // Lost a race with a concurrent restoration — final either way.
    if (!row) throw new ClientAlreadyActive();
    return row;
  }
}
