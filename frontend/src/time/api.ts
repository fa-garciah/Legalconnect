/**
 * 009. Every time-entry call, through `apiFetch` (the `/api/lc` proxy). Failures reject with
 * `{status, body}` or `null`, the contract `QueryBoundary` and `016a`'s classifier expect.
 */
import { apiFetch, type ApiResult, type FailedResponse } from '../lib/api-client';
import type { DateRange } from './range';
import type { EntryBody, RunningTimer, TimeEntry, Timesheet } from './types';

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) return Promise.reject(null);
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}

const onCase = (caseId: string, rest = '') => `/tenant/cases/${encodeURIComponent(caseId)}/time-entries${rest}`;

export async function getTimesheet(range: DateRange): Promise<Timesheet> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  return unwrap(await apiFetch<Timesheet>(`/tenant/time-entries?${params}`));
}

export async function getTimer(): Promise<RunningTimer | null> {
  return (await unwrap(await apiFetch<{ timer: RunningTimer | null }>('/tenant/time-entries/timer'))).timer;
}

export async function startTimer(caseId: string, description: string | null): Promise<RunningTimer> {
  return unwrap(await apiFetch<RunningTimer>(onCase(caseId, '/timer'), { method: 'POST', body: JSON.stringify({ description }) }));
}

export async function stopTimer(caseId: string, description: string | null): Promise<TimeEntry> {
  return unwrap(
    await apiFetch<TimeEntry>(onCase(caseId, '/timer/stop'), { method: 'POST', body: JSON.stringify({ description }) }),
  );
}

export async function discardTimer(): Promise<{ id: string }> {
  return unwrap(await apiFetch<{ id: string }>('/tenant/time-entries/timer/discard', { method: 'POST' }));
}

export async function logTime(caseId: string, body: EntryBody): Promise<TimeEntry> {
  return unwrap(await apiFetch<TimeEntry>(onCase(caseId), { method: 'POST', body: JSON.stringify(body) }));
}

export async function correctEntry(caseId: string, id: string, patch: Partial<EntryBody>): Promise<TimeEntry> {
  return unwrap(
    await apiFetch<TimeEntry>(onCase(caseId, `/${encodeURIComponent(id)}`), { method: 'PATCH', body: JSON.stringify(patch) }),
  );
}

export async function voidEntry(caseId: string, id: string): Promise<{ id: string }> {
  return unwrap(await apiFetch<{ id: string }>(onCase(caseId, `/${encodeURIComponent(id)}/void`), { method: 'POST' }));
}
