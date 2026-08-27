/**
 * T014 — the fetch wrapper `QueryBoundary` (via `useQuery`) sits on top of. Attaches
 * `x-identity-id` (FR-023's fixture principal) and `x-tenant-id` (when an active tenant
 * exists), and surfaces a failed response as a typed shape rather than throwing an
 * opaque `Error` that loses the wire shape `refusal-bucket.ts` needs
 * (004/contracts/refusal.md §2).
 */
import { getPrincipal } from '../session/principal';
import { readActiveTenantClient } from '../session/active-tenant';

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string };
  readonly capability?: string;
  readonly limit?: { readonly key: string; readonly value: number };
}

export type FailedResponse = { readonly status: number; readonly body: ErrorBody };

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number | null; readonly body: ErrorBody | null };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const principal = await getPrincipal();
  const activeTenant = readActiveTenantClient();

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-identity-id': principal.identityId,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (activeTenant.status === 'active') {
    headers['x-tenant-id'] = activeTenant.tenantId;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    // Network failure — no response at all. Opaque bucket, per FR-024's last sentence.
    return { ok: false, status: null, body: null };
  }

  if (!response.ok) {
    let body: ErrorBody | null = null;
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      body = null;
    }
    return { ok: false, status: response.status, body };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}
