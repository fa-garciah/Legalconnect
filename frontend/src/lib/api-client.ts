/**
 * T014 — the fetch wrapper `QueryBoundary` (via `useQuery`) sits on top of. Attaches
 * the access credential and `x-tenant-id` (when an active tenant exists), and surfaces
 * a failed response as a typed shape rather than throwing an opaque `Error` that loses
 * the wire shape `refusal-bucket.ts` needs (004/contracts/refusal.md §2).
 *
 * 003/T056: this used to send `x-identity-id` from 016a's fixture principal. That
 * header is gone — it asserted an identity nothing had verified (FR-041) — and this
 * module no longer sends it.
 *
 * THAT OPEN ITEM IS NOW CLOSED, AND THIS FILE IS WHERE IT SHOWS. This wrapper runs in
 * the BROWSER, and the access credential lives in an httpOnly cookie precisely so that
 * script on the page cannot read it (FR-051). So the token cannot be attached here:
 * reading it in JS would undo the property that keeps it out of reach of anything
 * injected into the page. Every browser-direct call therefore answered 401 — the client
 * directory and the case register could not load a single row, on any screen, ever.
 *
 * Of the two options this file recorded — a Next route-handler proxy attaching the
 * credential server-side, or same-site cookie auth on the API — the first was taken.
 * `src/app/api/lc/[...path]/route.ts` holds it and the reasoning. The consequence here is
 * one line: the base URL is now SAME-ORIGIN and relative, so the browser never addresses
 * the API directly and never needs a credential it is not allowed to hold.
 *
 * Nothing else in this file changed. `x-tenant-id` is still attached here, the FormData
 * content-type rule is unchanged, and the returned shape is identical — so `006`, `007`,
 * `018` and `019` call exactly what they called before.
 *
 * `x-tenant-id` is unchanged and stays, because it never was an identity claim: it
 * selects WHICH of the caller's memberships to activate, and `membership` under RLS
 * decides whether they may (002/FR-013, 002/FR-016).
 */
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

/*
 * Same-origin and relative, on purpose. The proxy route lives at this path, reads the
 * httpOnly cookie on the server and forwards to the real API — so `NEXT_PUBLIC_API_BASE_URL`
 * is no longer read in the browser at all. It stays in the environment because the proxy
 * itself reads it, server-side, where it is not inlined into the client bundle.
 */
const API_BASE_URL = '/api/lc';

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const activeTenant = readActiveTenantClient();

  const headers: Record<string, string> = {
    // A FormData body (007-document-management's multipart upload) must never carry an
    // explicit content-type: the browser sets its own, boundary included, only when it
    // is absent here.
    ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
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
