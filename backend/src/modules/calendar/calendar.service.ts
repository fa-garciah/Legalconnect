/**
 * 013 T008. The calendar's rules above SQL: range bounds, the case check on write, and merging an
 * update with the stored event before it is validated as a whole.
 */
import { Injectable } from '@nestjs/common';
import { EventCancelled, ResourceNotFound, ValidationFailed } from '../../common/http/errors';
import { currentPrincipal } from '../../common/tenant/middleware';
import { changedFields, normaliseEventInput, type EventInput } from './calendar-input';
import { CalendarRepository, type EventRow, type Viewer } from './calendar.repository';

const MAX_RANGE_DAYS = 62;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function viewer(): Viewer {
  const principal = currentPrincipal();
  return {
    membershipId: principal.membershipId,
    unrestricted: principal.archetype === 'MP' || principal.archetype === 'SA',
  };
}

function day(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || !DATE_ONLY.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new ValidationFailed(`${field} must be a date, YYYY-MM-DD.`);
  }
  return raw;
}

/** The stored event as a write body, so a patch can be merged onto it and validated whole. */
function asBody(row: EventRow): Record<string, unknown> {
  return {
    type: row.type,
    title: row.title,
    description: row.description,
    location: row.location,
    allDay: row.allDay,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    caseId: row.case?.id ?? null,
    remindMinutesBefore: row.remindMinutesBefore,
  };
}

const PATCHABLE = Object.keys(asBody({} as EventRow));

@Injectable()
export class CalendarService {
  constructor(private readonly repo: CalendarRepository) {}

  async list(query: { from?: unknown; to?: unknown; includeCancelled?: unknown }): Promise<readonly EventRow[]> {
    const from = day(query.from, 'from');
    const to = day(query.to, 'to');
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (days <= 0 || days > MAX_RANGE_DAYS) {
      throw new ValidationFailed(`The range must cover 1 to ${MAX_RANGE_DAYS} days.`);
    }
    return this.repo.listInRange(viewer(), { from, to }, query.includeCancelled === 'true');
  }

  async reminders(): Promise<readonly EventRow[]> {
    return this.repo.listDueReminders(viewer());
  }

  async create(body: unknown): Promise<EventRow> {
    const input = normaliseEventInput(body);
    const who = viewer();
    await this.assertCaseReachable(who, input.caseId);
    const principal = currentPrincipal();
    const id = await this.repo.insert(input, principal.tenantId, principal.membershipId);
    return (await this.repo.findVisible(who, id))!;
  }

  async update(id: string, patch: unknown): Promise<{ event: EventRow; changed: string[] }> {
    const who = viewer();
    const existing = await this.repo.findVisible(who, id);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'cancelled') throw new EventCancelled();

    const before = normaliseEventInput(asBody(existing));
    const changes = Object.fromEntries(
      Object.entries((patch ?? {}) as Record<string, unknown>).filter(([key]) => PATCHABLE.includes(key)),
    );
    const after: EventInput = normaliseEventInput({ ...asBody(existing), ...changes });
    if (after.caseId !== before.caseId) await this.assertCaseReachable(who, after.caseId);

    const changed = changedFields(before, after);
    if (changed.length > 0) await this.repo.update(id, after);
    return { event: (await this.repo.findVisible(who, id))!, changed };
  }

  async cancel(id: string): Promise<EventRow> {
    const who = viewer();
    const existing = await this.repo.findVisible(who, id);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'cancelled') throw new EventCancelled();
    await this.repo.cancel(id);
    return (await this.repo.findVisible(who, id))!;
  }

  /** 013/FR-007: a case the caller cannot reach answers 404, like one that does not exist. */
  private async assertCaseReachable(who: Viewer, caseId: string | null): Promise<void> {
    if (caseId && !(await this.repo.caseReachable(who, caseId))) throw new ResourceNotFound();
  }
}
