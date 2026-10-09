/**
 * 008 T004 (FR-013, Decision 2). The case activity feed is an explicit allow-list of MUTATIONS. An
 * action added to the audit vocabulary later is absent from every feed until a slice adds it here
 * on purpose — and accesses and hours never belong.
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '../../src/common/audit/actions';
import { ACTIVITY_ACTIONS } from '../../src/modules/notes/activity-actions';

describe('the activity allow-list', () => {
  it('is exactly the fifteen actions of FR-013', () => {
    expect([...ACTIVITY_ACTIONS].sort()).toEqual(
      [
        'case.created',
        'case.status_changed',
        'case.outcome_declared',
        'case.team_member_assigned',
        'case.team_member_unassigned',
        'document.uploaded',
        'document.category_changed',
        'document.withdrawn',
        'document.restored',
        'calendar_event.created',
        'calendar_event.updated',
        'calendar_event.cancelled',
        'note.created',
        'note.corrected',
        'note.voided',
      ].sort(),
    );
  });

  it('names only real actions', () => {
    for (const action of ACTIVITY_ACTIONS) expect(AUDIT_ACTIONS as readonly string[]).toContain(action);
  });

  it('contains no access record and no hours', () => {
    for (const excluded of ['case.read', 'document.previewed', 'document.downloaded', 'note.list_read']) {
      expect(ACTIVITY_ACTIONS as readonly string[]).not.toContain(excluded);
    }
    expect(ACTIVITY_ACTIONS.filter((a) => a.startsWith('time_entry.'))).toEqual([]);
  });
});
