/** 008. Wire fixtures for `/notas` and `/actividad`'s component tests. October 2026, Mexico City. */
import type { ActivityFeed, Note, NoteList } from '@/notes/types';

export const MONTH = '2026-10';
export const CASE_ID = 'case-1';

export const OWN_FRESH: Note = {
  id: 'n-own',
  body: 'El juez difirió la audiencia al 20 de octubre',
  createdAt: '2026-10-08T17:00:00.000Z',
  author: { membershipId: 'm-aa', position: 'Asociado' },
  own: true,
  correctableUntil: '2026-10-09T17:00:00.000Z',
};

export const OTHERS: Note = {
  id: 'n-other',
  body: 'El actuario pidió copia certificada',
  createdAt: '2026-10-07T15:00:00.000Z',
  author: { membershipId: 'm-pl', position: 'Pasante' },
  own: false,
  correctableUntil: null,
};

export const OWN_OLD: Note = {
  ...OWN_FRESH,
  id: 'n-old',
  body: 'Revisé el expediente físico',
  createdAt: '2026-10-02T15:00:00.000Z',
  correctableUntil: null,
};

export const NOTES: NoteList = { month: MONTH, items: [OWN_FRESH, OTHERS, OWN_OLD] };
export const NO_NOTES: NoteList = { month: MONTH, items: [] };

export const FEED: ActivityFeed = {
  month: MONTH,
  truncated: false,
  items: [
    {
      id: 'a3',
      action: 'note.created',
      occurredAt: '2026-10-08T17:00:00.000Z',
      actor: { membershipId: 'm-aa', position: 'Asociado' },
      fileName: null,
    },
    {
      id: 'a2',
      action: 'document.uploaded',
      occurredAt: '2026-10-07T16:00:00.000Z',
      actor: { membershipId: 'm-pl', position: 'Pasante' },
      fileName: 'Demanda inicial.pdf',
    },
    {
      id: 'a1',
      action: 'case.status_changed',
      occurredAt: '2026-10-01T16:00:00.000Z',
      actor: { membershipId: 'm-mp', position: 'Socio' },
      fileName: null,
    },
  ],
};

export const EMPTY_FEED: ActivityFeed = { month: MONTH, items: [], truncated: false };
