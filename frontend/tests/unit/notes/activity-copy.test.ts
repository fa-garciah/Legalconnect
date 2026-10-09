/**
 * 008 T017 — one Spanish sentence per allow-listed action (FR-013, FR-014). The sentence says what
 * KIND of change happened; it never carries a value, because the feed has none to carry.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVITY_SENTENCE, describeActivity } from '@/notes/activity-copy';
import type { ActivityEntry } from '@/notes/types';

/** Transcribed from 008/spec.md FR-013, not imported from the backend. */
const ALLOW_LIST = [
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
];

const entry = (action: string, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: 'a1',
  action,
  occurredAt: '2026-10-08T17:00:00.000Z',
  actor: { membershipId: 'm1', position: 'Asociado' },
  fileName: null,
  ...extra,
});

describe('ACTIVITY_SENTENCE', () => {
  it('has exactly one sentence for every allow-listed action, and none for anything else', () => {
    expect(Object.keys(ACTIVITY_SENTENCE).sort()).toEqual([...ALLOW_LIST].sort());
  });

  it('every sentence is plain Spanish with no placeholder or identifier in it', () => {
    for (const sentence of Object.values(ACTIVITY_SENTENCE)) {
      expect(sentence).toMatch(/^[a-záéíóúñ ]+$/);
    }
  });
});

describe('describeActivity', () => {
  it('names the actor by position', () => {
    expect(describeActivity(entry('note.created'))).toBe('Asociado agregó una nota');
  });

  it('names the document by its file name, and only documents', () => {
    expect(describeActivity(entry('document.uploaded', { fileName: 'Demanda.pdf' }))).toBe('Asociado subió el documento «Demanda.pdf»');
    expect(describeActivity(entry('note.voided', { fileName: 'x.pdf' }))).toBe('Asociado eliminó una nota');
  });

  it('a person with no position, or no person, still reads as a sentence', () => {
    expect(describeActivity(entry('case.created', { actor: { membershipId: 'm', position: null } }))).toBe(
      'Un integrante del despacho abrió el expediente',
    );
    expect(describeActivity(entry('case.created', { actor: null }))).toBe('El sistema abrió el expediente');
  });

  it('an action it does not know is described without its id', () => {
    expect(describeActivity(entry('time_entry.logged'))).toBe('Asociado hizo un cambio');
  });
});
