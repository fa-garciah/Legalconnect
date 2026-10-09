/**
 * 008 T003 (FR-009). Three mutations and one access. Only the access is channel-gated, as
 * `case.read` is: a person reading a matter's notes is the access worth recording, a monitoring job
 * is not.
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, CHANNEL_GATED_ACTIONS, TARGET_ENTITY_BY_ACTION } from '../../src/common/audit/actions';

const T = TARGET_ENTITY_BY_ACTION as Record<string, string>;

describe('008 note audit actions', () => {
  it.each(['note.created', 'note.corrected', 'note.voided'])('%s targets case_note and is not gated', (action) => {
    expect(AUDIT_ACTIONS as readonly string[]).toContain(action);
    expect(T[action]).toBe('case_note');
    expect(CHANNEL_GATED_ACTIONS.has(action as never)).toBe(false);
  });

  it('note.list_read targets the matter and is channel-gated (Decision 4)', () => {
    expect(AUDIT_ACTIONS as readonly string[]).toContain('note.list_read');
    expect(T['note.list_read']).toBe('case_file');
    expect(CHANNEL_GATED_ACTIONS.has('note.list_read' as never)).toBe(true);
  });

  it('no activity-read action exists (Decision 4)', () => {
    expect(AUDIT_ACTIONS.filter((a) => a.includes('activity'))).toEqual([]);
  });
});
