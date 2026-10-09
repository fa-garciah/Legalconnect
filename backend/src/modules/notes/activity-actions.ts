/**
 * 008 FR-013, Decision 2 — which audit actions make up a matter's activity feed. An explicit
 * allow-list of MUTATIONS: an action added to the vocabulary later is absent from every feed until a
 * slice adds it here on purpose.
 *
 * Deliberately absent: access records (`case.read`, `document.previewed`, `document.downloaded`,
 * `note.list_read`) — a feed telling the team who opened what would turn an evidentiary log into
 * workplace surveillance — and `time_entry.*`, which 009 made visible only to their author.
 */
import type { AuditAction } from '../../common/audit/actions';

export const ACTIVITY_ACTIONS: readonly AuditAction[] = [
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
