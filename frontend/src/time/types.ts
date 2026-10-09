/** 009. Wire shapes of contracts/time-entries-api.md, transcribed (not imported from `backend/`). */
export interface CaseRef {
  readonly id: string;
  readonly fileNumber: string;
}

export interface TimeEntry {
  readonly id: string;
  readonly case: CaseRef;
  readonly workDate: string;
  readonly minutes: number;
  readonly description: string;
  readonly source: 'timer' | 'manual';
  readonly loggedAt: string;
  /** Set by the server while the 24-hour correction window is open (FR-015). */
  readonly correctableUntil: string | null;
}

export interface Timesheet {
  readonly items: readonly TimeEntry[];
  readonly totalMinutes: number;
  readonly days: readonly { readonly date: string; readonly minutes: number }[];
}

export interface RunningTimer {
  readonly id: string;
  readonly case: CaseRef | null;
  readonly caseAvailable: boolean;
  readonly startedAt: string;
  readonly description: string | null;
}

export interface EntryBody {
  readonly workDate: string;
  readonly minutes: number;
  readonly description: string;
}
