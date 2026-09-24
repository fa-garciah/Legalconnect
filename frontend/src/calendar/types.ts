/** 013. Wire shapes of contracts/calendar-api.md, transcribed (not imported from `backend/`). */
export type EventType = 'hearing' | 'deadline' | 'meeting' | 'other';

export interface CalendarEvent {
  readonly id: string;
  readonly type: EventType;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly allDay: boolean;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly case: { readonly id: string; readonly fileNumber: string } | null;
  readonly remindMinutesBefore: number | null;
  readonly status: 'scheduled' | 'cancelled';
  readonly cancelledAt: string | null;
  readonly createdByMembershipId: string;
  readonly createdAt: string;
}

export interface EventBody {
  readonly type: EventType;
  readonly title: string;
  readonly allDay: boolean;
  readonly startsAt?: string;
  readonly endsAt?: string | null;
  readonly startsOn?: string;
  readonly endsOn?: string | null;
  readonly caseId: string | null;
  readonly location: string | null;
  readonly description: string | null;
  readonly remindMinutesBefore: number | null;
}
