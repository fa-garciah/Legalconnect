/**
 * 008. Every notes and activity call, through `apiFetch` (the `/api/lc` proxy). Failures reject with
 * `{status, body}` or `null`, the contract `QueryBoundary` and `016a`'s classifier expect.
 */
import { apiFetch, type ApiResult, type FailedResponse } from '../lib/api-client';
import type { ActivityFeed, Note, NoteList } from './types';

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) return Promise.reject(null);
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}

const onCase = (caseId: string, rest: string) => `/tenant/cases/${encodeURIComponent(caseId)}${rest}`;

export async function listNotes(caseId: string, month: string): Promise<NoteList> {
  return unwrap(await apiFetch<NoteList>(onCase(caseId, `/notes?${new URLSearchParams({ month })}`)));
}

export async function createNote(caseId: string, body: string): Promise<Note> {
  return unwrap(await apiFetch<Note>(onCase(caseId, '/notes'), { method: 'POST', body: JSON.stringify({ body }) }));
}

export async function correctNote(caseId: string, id: string, body: string): Promise<Note> {
  return unwrap(
    await apiFetch<Note>(onCase(caseId, `/notes/${encodeURIComponent(id)}`), { method: 'PATCH', body: JSON.stringify({ body }) }),
  );
}

export async function voidNote(caseId: string, id: string): Promise<{ id: string }> {
  return unwrap(await apiFetch<{ id: string }>(onCase(caseId, `/notes/${encodeURIComponent(id)}/void`), { method: 'POST' }));
}

export async function getActivity(caseId: string, month: string): Promise<ActivityFeed> {
  return unwrap(await apiFetch<ActivityFeed>(onCase(caseId, `/activity?${new URLSearchParams({ month })}`)));
}
