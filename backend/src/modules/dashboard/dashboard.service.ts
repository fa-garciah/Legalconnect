/**
 * 024 — composes the dashboard. Each section is a read; all of them run in the request's single
 * transaction (FR-001), so no section can disagree with another.
 */
import { Injectable } from '@nestjs/common';
import { MATRIX } from '../../common/authz/matrix';
import { currentPrincipal } from '../../common/tenant/middleware';
import type { ActivityRow } from '../notes/activity-query';
import { DashboardRepository, type EventSummary, type Viewer } from './dashboard.repository';

export interface Dashboard {
  readonly today: string;
  readonly activeMatters: number;
  /** Null for a caller who is not a timekeeper (`time.read_own`) — `SA` (009 Decision 10). */
  readonly myMinutesToday: number | null;
  readonly todayEvents: readonly EventSummary[];
  readonly deadlines: { readonly upcoming: readonly EventSummary[]; readonly recent: readonly EventSummary[] };
  readonly recentActivity: readonly ActivityRow[];
}

/** Decision 2: the next seven days, and the last seven — never called "overdue". */
const WINDOW_DAYS = 7;

@Injectable()
export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  async read(): Promise<Dashboard> {
    const principal = currentPrincipal();
    const viewer: Viewer = {
      membershipId: principal.membershipId,
      unrestricted: principal.archetype === 'MP' || principal.archetype === 'SA',
    };
    // Sequential on purpose: every read shares the request's one transaction connection.
    const today = await this.repo.today();
    const activeMatters = await this.repo.activeMatters(viewer);
    const myMinutesToday = MATRIX['time.read_own'].has(principal.archetype) ? await this.repo.ownMinutesToday(viewer) : null;
    const todayEvents = await this.repo.eventsToday(viewer);
    const upcoming = await this.repo.deadlines(viewer, 0, WINDOW_DAYS, 'asc');
    const recent = await this.repo.deadlines(viewer, -WINDOW_DAYS, 0, 'desc');
    const recentActivity = await this.repo.recentActivity(viewer);
    return { today, activeMatters, myMinutesToday, todayEvents, deadlines: { upcoming, recent }, recentActivity };
  }
}
