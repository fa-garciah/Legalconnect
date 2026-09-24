/**
 * 013. Every calendar call, through `apiFetch` (the `/api/lc` proxy). Failures reject with
 * `{status, body}` or `null`, the contract `QueryBoundary` and `016a`'s classifier expect.
 */
import { apiFetch, type ApiResult, type FailedResponse } from '../lib/api-client';
import type { CalendarEvent, EventBody } from './types';

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) return Promise.reject(null);
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}

export async function listEvents(range: { from: string; to: string }, includeCancelled = false): Promise<readonly CalendarEvent[]> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (includeCancelled) params.set('includeCancelled', 'true');
  const page = await unwrap(await apiFetch<{ items: readonly CalendarEvent[] }>(`/tenant/calendar/events?${params}`));
  return page.items;
}

export async function listReminders(): Promise<readonly CalendarEvent[]> {
  const page = await unwrap(await apiFetch<{ items: readonly CalendarEvent[] }>('/tenant/calendar/reminders'));
  return page.items;
}

export async function createEvent(body: EventBody): Promise<CalendarEvent> {
  return unwrap(await apiFetch<CalendarEvent>('/tenant/calendar/events', { method: 'POST', body: JSON.stringify(body) }));
}

export async function updateEvent(id: string, patch: Partial<EventBody>): Promise<CalendarEvent> {
  return unwrap(
    await apiFetch<CalendarEvent>(`/tenant/calendar/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  );
}

export async function cancelEvent(id: string): Promise<CalendarEvent> {
  return unwrap(
    await apiFetch<CalendarEvent>(`/tenant/calendar/events/${encodeURIComponent(id)}/cancel`, { method: 'PATCH' }),
  );
}
