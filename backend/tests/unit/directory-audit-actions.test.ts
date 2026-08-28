/**
 * T005 — 017/FR-003: the three audit actions this slice adds. None is channel-gated —
 * none is a read of a monitorable log, the same reasoning 002's own nine additions
 * carried.
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, CHANNEL_GATED_ACTIONS, TARGET_ENTITY_BY_ACTION } from '../../src/common/audit/actions';

const NEW_ACTIONS = ['position.created', 'position.retired', 'directory.position_assigned'] as const;

describe('017 directory audit actions', () => {
  it('AUDIT_ACTIONS contains all three new actions', () => {
    for (const action of NEW_ACTIONS) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
  });

  it('none of the three is channel-gated', () => {
    for (const action of NEW_ACTIONS) {
      expect(CHANNEL_GATED_ACTIONS.has(action)).toBe(false);
    }
  });

  it('TARGET_ENTITY_BY_ACTION has an entry for each — position for catalog changes, membership for assignment', () => {
    expect(TARGET_ENTITY_BY_ACTION['position.created']).toBe('position');
    expect(TARGET_ENTITY_BY_ACTION['position.retired']).toBe('position');
    expect(TARGET_ENTITY_BY_ACTION['directory.position_assigned']).toBe('membership');
  });

  it('AUDIT_ACTIONS holds exactly 31 actions (16 from 001/002, 3 from 017, 12 from 006)', () => {
    expect(AUDIT_ACTIONS).toHaveLength(31);
  });
});
