/**
 * 009 — the rules above SQL: the range bound, "not after today", the single running timer, the
 * elapsed-to-minutes conversion, the 24-hour correction window.
 *
 * Reach for a write is NOT checked here. Every write route is nested under `:caseId` with
 * `@ScopeTarget('caseId')`, so 006's resolver has answered before this runs — the global mechanism
 * the constitution requires, rather than a hand-written check per endpoint (009 Decision 9). What is
 * checked here is ownership, which no resolver knows about: the caller's own entry, on this matter.
 */
import { Injectable } from '@nestjs/common';
import {
  CorrectionWindowClosed,
  EntryVoided,
  NoRunningTimer,
  ResourceNotFound,
  TimerRunning,
  TimerTooLong,
  ValidationFailed,
} from '../../common/http/errors';
import { currentPrincipal } from '../../common/tenant/middleware';
import { dayTotals, exceedsDay, minutesFromElapsed, sumMinutes } from './duration';
import {
  changedFields,
  normaliseCorrection,
  normaliseManualEntry,
  normaliseStopBody,
  normaliseTimerStart,
} from './time-entry-input';
import { TimeEntriesRepository, type EntryRow, type RunningTimerRow, type Viewer } from './time-entries.repository';

const MAX_RANGE_DAYS = 62;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UNIQUE_VIOLATION = '23505';

export interface Timesheet {
  readonly items: readonly EntryRow[];
  readonly totalMinutes: number;
  readonly days: readonly { date: string; minutes: number }[];
}

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

function sqlstateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

@Injectable()
export class TimeEntriesService {
  constructor(private readonly repo: TimeEntriesRepository) {}

  /** FR-009, FR-010: the items and both totals from ONE set of rows, so no total can disagree. */
  async timesheet(query: { from?: unknown; to?: unknown }): Promise<Timesheet> {
    const from = day(query.from, 'from');
    const to = day(query.to, 'to');
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (days <= 0 || days > MAX_RANGE_DAYS) {
      throw new ValidationFailed(`The range must cover 1 to ${MAX_RANGE_DAYS} days.`);
    }
    const items = await this.repo.listOwn(viewer(), { from, to });
    return { items, totalMinutes: sumMinutes(items), days: dayTotals(items) };
  }

  async runningTimer(): Promise<RunningTimerRow | null> {
    return this.repo.runningTimer(viewer());
  }

  /** FR-006. The pre-check is the fast path; the partial unique index is what makes it race-free. */
  async startTimer(caseId: string, body: unknown): Promise<RunningTimerRow> {
    const { description } = normaliseTimerStart(body);
    const who = viewer();
    await this.assertCaseInFirm(caseId);
    if (await this.repo.runningTimer(who)) throw new TimerRunning();
    const principal = currentPrincipal();
    try {
      await this.repo.startTimer(principal.tenantId, caseId, principal.membershipId, description);
    } catch (error) {
      if (sqlstateOf(error) === UNIQUE_VIOLATION) throw new TimerRunning();
      throw error;
    }
    return (await this.repo.runningTimer(who))!;
  }

  /** FR-007, FR-011. Stopping needs a description from somewhere, and at most a day of time. */
  async stopTimer(caseId: string, body: unknown): Promise<EntryRow> {
    const given = normaliseStopBody(body).description;
    await this.assertCaseInFirm(caseId);
    const principal = currentPrincipal();
    const running = await this.repo.lockRunningOn(principal.membershipId, caseId);
    if (!running) throw new NoRunningTimer();
    const description = given ?? running.description;
    if (!description) throw new ValidationFailed('description is required to record the time.');
    if (exceedsDay(running.elapsedSeconds)) throw new TimerTooLong();
    await this.repo.stopTimer(running.id, minutesFromElapsed(running.elapsedSeconds), description);
    return this.repo.findListed(viewer(), running.id);
  }

  /** FR-008: whatever the matter, reachable or not. */
  async discardTimer(): Promise<{ id: string }> {
    const id = await this.repo.discardRunning(currentPrincipal().membershipId);
    if (!id) throw new NoRunningTimer();
    return { id };
  }

  /** FR-011: time is recorded for work done — never after today in Mexico City. */
  async logManual(caseId: string, body: unknown): Promise<EntryRow> {
    const input = normaliseManualEntry(body);
    await this.assertCaseInFirm(caseId);
    if (input.workDate > (await this.repo.today())) {
      throw new ValidationFailed('workDate cannot be after today.');
    }
    const principal = currentPrincipal();
    const id = await this.repo.insertManual(principal.tenantId, caseId, principal.membershipId, input);
    return this.repo.findListed(viewer(), id);
  }

  /** FR-013. Own, logged, in window; only date, minutes and description move. */
  async correct(caseId: string, id: string, body: unknown): Promise<{ entry: EntryRow; changed: string[] }> {
    const patch = normaliseCorrection(body);
    const entry = await this.correctable(caseId, id);
    const before = { workDate: entry.workDate, minutes: entry.minutes!, description: entry.description! };
    const after = { ...before, ...patch };
    if (after.workDate > (await this.repo.today())) {
      throw new ValidationFailed('workDate cannot be after today.');
    }
    const changed = changedFields(before, after);
    if (changed.length > 0) await this.repo.correct(id, after);
    return { entry: await this.repo.findListed(viewer(), id), changed };
  }

  async void(caseId: string, id: string): Promise<{ id: string }> {
    await this.correctable(caseId, id);
    await this.repo.void(id);
    return { id };
  }

  /**
   * 404 for a matter that is not this firm's. The resolver has already refused every archetype but
   * MP for an unreachable matter; this closes the MP path, which the resolver waves through without
   * a query (see `TimeEntriesRepository.caseInFirm`).
   */
  private async assertCaseInFirm(caseId: string): Promise<void> {
    if (!(await this.repo.caseInFirm(caseId))) throw new ResourceNotFound();
  }

  /**
   * The caller's own entry on this matter — 404 otherwise, including somebody else's, so an entry
   * id cannot be used to learn whose time exists. A running timer is not "an entry" for correction
   * either: it is corrected by stopping or discarding it.
   */
  private async correctable(caseId: string, id: string) {
    const entry = await this.repo.lockOwn(currentPrincipal().membershipId, caseId, id);
    if (!entry || entry.status === 'running') throw new ResourceNotFound();
    if (entry.status === 'voided') throw new EntryVoided();
    if (!entry.windowOpen) throw new CorrectionWindowClosed();
    return entry;
  }
}
