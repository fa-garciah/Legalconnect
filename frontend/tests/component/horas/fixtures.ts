/** 009. Wire fixtures for `/horas`'s component tests. Today is Thursday 8 Oct 2026, Mexico City. */
import type { RunningTimer, TimeEntry, Timesheet } from '@/time/types';

export const TODAY = '2026-10-08';

export const FRESH: TimeEntry = {
  id: 'te-fresh',
  case: { id: 'case-1', fileNumber: 'EXP-2026-0042' },
  workDate: '2026-10-08',
  minutes: 90,
  description: 'Redacción de contestación de demanda',
  source: 'timer',
  loggedAt: '2026-10-08T17:00:00.000Z',
  correctableUntil: '2026-10-09T17:00:00.000Z',
};

export const MANUAL_TODAY: TimeEntry = {
  ...FRESH,
  id: 'te-manual',
  minutes: 45,
  description: 'Llamada con el cliente',
  source: 'manual',
  loggedAt: '2026-10-08T15:00:00.000Z',
  correctableUntil: '2026-10-09T15:00:00.000Z',
};

export const OLD: TimeEntry = {
  ...FRESH,
  id: 'te-old',
  case: { id: 'case-2', fileNumber: 'EXP-2026-0007' },
  workDate: '2026-10-06',
  minutes: 120,
  description: 'Análisis de jurisprudencia aplicable',
  source: 'manual',
  loggedAt: '2026-10-07T01:00:00.000Z',
  correctableUntil: null,
};

export const SHEET: Timesheet = {
  items: [FRESH, MANUAL_TODAY, OLD],
  totalMinutes: 255,
  days: [
    { date: '2026-10-08', minutes: 135 },
    { date: '2026-10-06', minutes: 120 },
  ],
};

export const EMPTY_SHEET: Timesheet = { items: [], totalMinutes: 0, days: [] };

export const RUNNING: RunningTimer = {
  id: 'te-running',
  case: { id: 'case-1', fileNumber: 'EXP-2026-0042' },
  caseAvailable: true,
  startedAt: '2026-10-08T16:00:00.000Z',
  description: null,
};

export const CASES = {
  items: [
    { id: 'case-1', fileNumber: 'EXP-2026-0042', client: { id: 'c', legalName: 'Grupo Norte' } },
    { id: 'case-2', fileNumber: 'EXP-2026-0007', client: { id: 'c', legalName: 'Grupo Norte' } },
  ],
  nextCursor: null,
};

export const refusal = (status: number, code: string) => ({ error: { code, message: code } });
