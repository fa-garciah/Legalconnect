/**
 * T024 — the five calls of `006`'s client API.
 *
 * **Everything goes through `apiFetch`** (contracts/client-screens.md §0). It is the only
 * place `x-identity-id` and `x-tenant-id` are attached, so a call that built its own
 * request would reach the server as nobody, from nowhere. There is no exception here.
 *
 * **`unwrap` is the shape `QueryBoundary` expects.** `apiFetch` never throws; it returns a
 * discriminated result. But `useQuery` communicates failure by rejection, and `016a`'s
 * `classifyRefusal` needs the status and body intact — a thrown `Error` would flatten both
 * into a string and every refusal would classify as opaque. So a failure rejects with
 * `{status, body}`, or with `null` when there was no response at all. Same contract
 * `src/app/documents/api.ts` already uses.
 *
 * **The boundary conversions live here and nowhere else** (data-model.md). A form holds
 * `''` for a blank RFC because a controlled input must; the wire wants `null` because that
 * is what "not collected" means and what the directory renders as a dash. Doing that
 * conversion in the form as well as here is how the two come to disagree.
 */
import { apiFetch, type ApiResult, type FailedResponse } from '../lib/api-client';
import type {
  Client,
  ClientListQuery,
  ClientListResponse,
  ClientStatusChangeResponse,
} from './types';

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) {
    // No response at all — nothing to classify, and `016a` buckets it as opaque.
    return Promise.reject(null);
  }
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}

/**
 * A value that is meaningfully present.
 *
 * `006` treats an empty or whitespace-only `q` as *absent*, not as a match-nothing filter
 * — so sending `q=` after someone clears the search box would ask a different question
 * than asking nothing, and could return an empty directory for a firm that has clients.
 */
function meaningful(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** `GET /tenant/clients`. Every filter is omitted when absent, never sent empty. */
export function listClients(query: ClientListQuery): Promise<ClientListResponse> {
  const params = new URLSearchParams();

  const q = meaningful(query.q);
  if (q) params.set('q', q);
  if (query.status) params.set('status', query.status);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  // Verbatim. `001` encodes this and `006` returns it; parsing or rebuilding it would
  // couple these screens to an encoding neither slice promised to keep.
  if (query.cursor) params.set('cursor', query.cursor);

  const suffix = params.toString();
  return apiFetch<ClientListResponse>(`/tenant/clients${suffix ? `?${suffix}` : ''}`).then(unwrap);
}

/** What the create and edit form holds. `rfc` is a string because a controlled input needs one. */
export interface ClientFormValues {
  readonly kind: Client['kind'];
  readonly legalName: string;
  readonly rfc: string;
}

/** `POST /tenant/clients`. */
export function createClient(values: ClientFormValues): Promise<Client> {
  return apiFetch<Client>('/tenant/clients', {
    method: 'POST',
    body: JSON.stringify({
      kind: values.kind,
      legalName: values.legalName.trim(),
      rfc: values.rfc.trim() || null,
    }),
  }).then(unwrap);
}

/** The fields an edit may name. Deliberately not `Partial<Client>` — see below. */
export interface ClientEdit {
  readonly legalName?: string;
  readonly rfc?: string;
}

/**
 * `PATCH /tenant/clients/:id`.
 *
 * **`kind` is never sent, and neither is anything else the caller happened to pass.** `006`
 * refuses a `PATCH` naming `kind` with a `400` — it does not ignore it — so the natural
 * implementation, spreading the client being edited into the payload, fails on every save.
 * The payload is therefore assembled field by field from a closed list rather than derived
 * from the argument, so an over-wide object cannot leak through at runtime the way it
 * cannot through the type.
 *
 * A field the caller did not name is omitted, because `006` leaves omitted fields
 * unchanged. Sending `legalName: null` for a field nobody edited would blank a name.
 */
export function updateClient(id: string, edit: ClientEdit): Promise<Client> {
  const body: Record<string, unknown> = {};
  if (edit.legalName !== undefined) body.legalName = edit.legalName.trim();
  // An empty string here is a deliberate erasure — the reader cleared the field — so it
  // becomes null rather than being dropped as "unchanged".
  if (edit.rfc !== undefined) body.rfc = edit.rfc.trim() || null;

  return apiFetch<Client>(`/tenant/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }).then(unwrap);
}

/**
 * `POST /tenant/clients/:id/deactivate` — withdraw.
 *
 * Succeeds however many live cases reference the client; every one of them keeps resolving
 * it (`006/FR-008`). What withdrawal prevents is a *future* case being opened.
 */
export function deactivateClient(id: string): Promise<ClientStatusChangeResponse> {
  return apiFetch<ClientStatusChangeResponse>(`/tenant/clients/${id}/deactivate`, {
    method: 'POST',
  }).then(unwrap);
}

/**
 * `POST /tenant/clients/:id/reactivate` — restore.
 *
 * The same capability as withdrawal (`006/FR-004a`): whoever may take a party out of
 * circulation may put them back. Without this route a mis-click bars a client permanently
 * and the only remedy is a duplicate record.
 */
export function reactivateClient(id: string): Promise<ClientStatusChangeResponse> {
  return apiFetch<ClientStatusChangeResponse>(`/tenant/clients/${id}/reactivate`, {
    method: 'POST',
  }).then(unwrap);
}
