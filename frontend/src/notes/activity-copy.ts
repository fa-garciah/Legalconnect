/**
 * 008 FR-013, FR-014 — what each allow-listed change reads as. The sentence names the KIND of change;
 * the feed carries no previous or new value, so no sentence has a slot for one. The actor is named by
 * position (FR-015), never by email.
 */
import type { ActivityEntry } from './types';

export const ACTIVITY_SENTENCE: Readonly<Record<string, string>> = {
  'case.created': 'abrió el expediente',
  'case.status_changed': 'cambió el estado del expediente',
  'case.outcome_declared': 'declaró el resultado del expediente',
  'case.team_member_assigned': 'agregó a una persona al equipo',
  'case.team_member_unassigned': 'retiró a una persona del equipo',
  'document.uploaded': 'subió el documento',
  'document.category_changed': 'cambió la categoría del documento',
  'document.withdrawn': 'retiró el documento',
  'document.restored': 'restauró el documento',
  'calendar_event.created': 'agendó un evento',
  'calendar_event.updated': 'modificó un evento',
  'calendar_event.cancelled': 'canceló un evento',
  'note.created': 'agregó una nota',
  'note.corrected': 'corrigió una nota',
  'note.voided': 'eliminó una nota',
};

function who(entry: ActivityEntry): string {
  if (!entry.actor) return 'El sistema';
  return entry.actor.position ?? 'Un integrante del despacho';
}

export function describeActivity(entry: ActivityEntry): string {
  const what = ACTIVITY_SENTENCE[entry.action] ?? 'hizo un cambio';
  const document = entry.action.startsWith('document.') && entry.fileName ? ` «${entry.fileName}»` : '';
  return `${who(entry)} ${what}${document}`;
}
