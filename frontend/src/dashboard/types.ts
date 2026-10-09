/** 024. Wire shape of contracts/dashboard-api.md, transcribed (not imported from `backend/`). */
import type { ActivityEntry } from '../notes/types';

export interface CaseRef {
  readonly id: string;
  readonly fileNumber: string;
}

export interface EventSummary {
  readonly id: string;
  readonly type: 'hearing' | 'deadline' | 'meeting' | 'other';
  readonly title: string;
  readonly allDay: boolean;
  readonly startsAt: string | null;
  readonly startsOn: string | null;
  readonly case: CaseRef | null;
}

export interface DashboardActivity extends ActivityEntry {
  readonly case: CaseRef;
}

export interface Dashboard {
  /** Mexico City, computed by the server (Decision 7). */
  readonly today: string;
  readonly activeMatters: number;
  /** Null when the caller is not a timekeeper. */
  readonly myMinutesToday: number | null;
  readonly todayEvents: readonly EventSummary[];
  readonly deadlines: { readonly upcoming: readonly EventSummary[]; readonly recent: readonly EventSummary[] };
  readonly recentActivity: readonly DashboardActivity[];
}
