/**
 * T013 — the fetch wrapper `QueryBoundary` and every query sits on top of. Attaches
 * the two headers 002/004 read; surfaces a failed response as a typed shape rather
 * than throwing an opaque Error that loses the wire shape refusal-bucket.ts needs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/session/principal', () => ({
  getPrincipal: vi.fn(),
}));
vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';
import { getPrincipal } from '@/session/principal';
import { readActiveTenantClient } from '@/session/active-tenant';

describe('apiFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getPrincipal).mockResolvedValue({
      identityId: 'identity-1',
      memberships: [],
    });
    vi.mocked(readActiveTenantClient).mockReturnValue({
      status: 'active',
      tenantId: 'tenant-1',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('attaches x-identity-id and x-tenant-id when an active tenant exists', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await apiFetch('/tenant/invitations');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-identity-id']).toBe('identity-1');
    expect(headers['x-tenant-id']).toBe('tenant-1');
  });

  it('omits x-tenant-id when there is no active tenant', async () => {
    vi.mocked(readActiveTenantClient).mockReturnValue({ status: 'none' });
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));

    await apiFetch('/identity/memberships');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-tenant-id']).toBeUndefined();
  });

  it('a failed response is surfaced as { status, body }, never thrown as an opaque Error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_authorized', message: 'x' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await apiFetch('/tenant/memberships/1/archetype');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.body?.error.code).toBe('not_authorized');
    }
  });

  it('a network failure (fetch rejects) is surfaced as ok: false with no response', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await apiFetch('/tenant/invitations');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBeNull();
    }
  });

  it('007-document-management: omits content-type for a FormData body, so the browser sets its own multipart boundary', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));

    const form = new FormData();
    form.append('file', new Blob(['x']), 'x.pdf');
    await apiFetch('/tenant/cases/case-1/documents', { method: 'POST', body: form });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBeUndefined();
    expect(headers['x-identity-id']).toBe('identity-1');
  });
});
