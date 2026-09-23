/**
 * 014-admin-ui, Decision 5 — the one audit action this slice adds. Reading the firm's members
 * with their email is a read of personal data (Principle VI); channel-gated like `case.read`
 * so a monitoring job cannot inflate the log it watches.
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, CHANNEL_GATED_ACTIONS, TARGET_ENTITY_BY_ACTION } from '../../src/common/audit/actions';

describe('014 member-list audit action', () => {
  it('is in the vocabulary', () => {
    expect(AUDIT_ACTIONS).toContain('membership.list_read');
  });

  it('is channel-gated', () => {
    expect(CHANNEL_GATED_ACTIONS.has('membership.list_read')).toBe(true);
  });

  it('names the firm as its target — there is no single member', () => {
    expect(TARGET_ENTITY_BY_ACTION['membership.list_read']).toBe('tenant');
  });
});
