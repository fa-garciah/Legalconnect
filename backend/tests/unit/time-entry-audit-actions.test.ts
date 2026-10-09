/**
 * 009 T004 (FR-014). Six actions, one per mutation, all targeting `time_entry`. None is
 * channel-gated: each is a change, and reading one's own timesheet is not audited (Decision 8).
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, CHANNEL_GATED_ACTIONS, TARGET_ENTITY_BY_ACTION } from '../../src/common/audit/actions';

const TIME = [
  'time_entry.timer_started',
  'time_entry.timer_stopped',
  'time_entry.timer_discarded',
  'time_entry.logged',
  'time_entry.corrected',
  'time_entry.voided',
] as const;

describe('009 time-entry audit actions', () => {
  it.each(TIME)('%s is in the vocabulary, targets time_entry, and is not channel-gated', (action) => {
    expect(AUDIT_ACTIONS as readonly string[]).toContain(action);
    expect((TARGET_ENTITY_BY_ACTION as Record<string, string>)[action]).toBe('time_entry');
    expect(CHANNEL_GATED_ACTIONS.has(action as never)).toBe(false);
  });

  it('no read action exists for time entries', () => {
    expect(AUDIT_ACTIONS.filter((a) => a.startsWith('time_entry.') && a.endsWith('read'))).toEqual([]);
  });
});
