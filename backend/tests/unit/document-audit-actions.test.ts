/**
 * T007 — 007/FR-019, FR-020: the eight audit actions this slice adds. Six mutations,
 * unconditional; two access records (preview, download) channel-gated, joining 006's
 * `case.read` and 001's `audit.queried`/`tenant.registry_read`.
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, CHANNEL_GATED_ACTIONS, TARGET_ENTITY_BY_ACTION } from '../../src/common/audit/actions';

const NEW_ACTIONS = [
  'document.uploaded',
  'document.previewed',
  'document.downloaded',
  'document.category_changed',
  'document.withdrawn',
  'document.restored',
  'document_category.created',
  'document_category.retired',
] as const;

const CHANNEL_GATED_NEW = ['document.previewed', 'document.downloaded'] as const;

describe('007 document audit actions', () => {
  it('AUDIT_ACTIONS contains all eight new actions', () => {
    for (const action of NEW_ACTIONS) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
  });

  it('only document.previewed and document.downloaded are channel-gated', () => {
    for (const action of NEW_ACTIONS) {
      const expected = (CHANNEL_GATED_NEW as readonly string[]).includes(action);
      expect(CHANNEL_GATED_ACTIONS.has(action)).toBe(expected);
    }
  });

  it('TARGET_ENTITY_BY_ACTION has an entry for each', () => {
    expect(TARGET_ENTITY_BY_ACTION['document.uploaded']).toBe('document');
    expect(TARGET_ENTITY_BY_ACTION['document.previewed']).toBe('document');
    expect(TARGET_ENTITY_BY_ACTION['document.downloaded']).toBe('document');
    expect(TARGET_ENTITY_BY_ACTION['document.category_changed']).toBe('document');
    expect(TARGET_ENTITY_BY_ACTION['document.withdrawn']).toBe('document');
    expect(TARGET_ENTITY_BY_ACTION['document.restored']).toBe('document');
    expect(TARGET_ENTITY_BY_ACTION['document_category.created']).toBe('document_category');
    expect(TARGET_ENTITY_BY_ACTION['document_category.retired']).toBe('document_category');
  });

  it('AUDIT_ACTIONS holds exactly 39 actions (31 inherited + 8 new)', () => {
    expect(AUDIT_ACTIONS).toHaveLength(39);
  });
});
