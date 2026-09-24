/**
 * 013 T003 (FR-009). The calendar's three audit actions. None is channel-gated: each is a change,
 * and reading the calendar is not audited at all (as 006's case list is not).
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, CHANNEL_GATED_ACTIONS, TARGET_ENTITY_BY_ACTION } from '../../src/common/audit/actions';

const CALENDAR = ['calendar_event.created', 'calendar_event.updated', 'calendar_event.cancelled'] as const;

describe('013 calendar audit actions', () => {
  it.each(CALENDAR)('%s is in the vocabulary, targets calendar_event, and is not channel-gated', (action) => {
    expect(AUDIT_ACTIONS).toContain(action);
    expect(TARGET_ENTITY_BY_ACTION[action]).toBe('calendar_event');
    expect(CHANNEL_GATED_ACTIONS.has(action)).toBe(false);
  });
});
