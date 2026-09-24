/**
 * The credential-attaching proxy. Closes the open item `api-client.ts` recorded.
 *
 * THE PROBLEM IT SOLVES, IN THE WORDS OF THE FILE THAT NAMED IT: "This wrapper runs in
 * the BROWSER, and the access credential lives in an httpOnly cookie precisely so that
 * script on the page cannot read it (003/FR-051). So the token cannot simply be attached
 * here." The consequence was not theoretical — every browser-direct call answered 401,
 * so neither the client directory nor the case register could load a single row.
 *
 * `api-client.ts` named the two real options: a Next route-handler proxy that attaches
 * the credential server-side, or same-site cookie auth on the API. This is the first.
 * The second was rejected because it would make the API trust a cookie, and the API's
 * whole auth model is that it trusts a bearer token it can resolve against its own
 * `session` table (003/FR-034) — changing that to satisfy the browser would be the
 * frontend dictating the backend's security model.
 *
 * WHAT MUST BE TRUE, AND IS ASSERTED BELOW. The proxy is a hole punched through the
 * httpOnly boundary on purpose, so its rules matter more than its convenience:
 *   - it attaches the credential the browser cannot read, and
 *   - it NEVER lets the browser supply one, which would make the hole a bypass.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readAccessToken = vi.fn<() => Promise<string | null>>();
vi.mock('@/session/session-store', () => ({ readAccessToken: () => readAccessToken() }));

import { GET, POST, PATCH, DELETE } from '@/app/api/lc/[...path]/route';

const upstream = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ctx(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

describe('the API proxy', () => {
  beforeEach(() => {
    readAccessToken.mockReset().mockResolvedValue('the-api-access-token');
    upstream.mockReset().mockResolvedValue(ok({ items: [] }));
    vi.stubGlobal('fetch', upstream);
  });

  it('attaches the credential the browser cannot read', async () => {
    await GET(new Request('http://localhost:3000/api/lc/tenant/clients'), ctx(['tenant', 'clients']));

    const [, init] = upstream.mock.calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer the-api-access-token');
  });

  it('forwards the path and the query string unchanged', async () => {
    await GET(
      new Request('http://localhost:3000/api/lc/tenant/clients?limit=50&status=active'),
      ctx(['tenant', 'clients']),
    );

    expect(upstream.mock.calls[0]![0]).toBe('http://localhost:3001/tenant/clients?limit=50&status=active');
  });

  it('forwards x-tenant-id, which selects the membership to activate', async () => {
    await GET(
      new Request('http://localhost:3000/api/lc/tenant/clients', {
        headers: { 'x-tenant-id': 'tenant-a' },
      }),
      ctx(['tenant', 'clients']),
    );

    expect((upstream.mock.calls[0]![1].headers as Record<string, string>)['x-tenant-id']).toBe('tenant-a');
  });

  /*
   * 014/FR-027. 005's step-up gates five mutations behind `x-step-up-token`, and the allow-list
   * dropped it — so from the browser every one of them was refused, however good the code. The
   * token is not a credential that could stand in for the session: the API binds it to one
   * identity and one capability, consumes it on first use (`consume_step_up`), and accepts it only
   * alongside the bearer this proxy attaches.
   */
  it('forwards x-step-up-token, a single-use elevation of one capability', async () => {
    await POST(
      new Request('http://localhost:3000/api/lc/tenant/invitations', {
        method: 'POST',
        headers: { 'x-step-up-token': 'elev-5', authorization: 'Bearer forged' },
        body: '{}',
      }),
      ctx(['tenant', 'invitations']),
    );

    const sent = upstream.mock.calls[0]![1].headers as Record<string, string>;
    expect(sent['x-step-up-token']).toBe('elev-5');
    expect(sent.authorization).toBe('Bearer the-api-access-token');
  });

  it('NEVER forwards a browser-supplied authorization header — that would make this a bypass', async () => {
    await GET(
      new Request('http://localhost:3000/api/lc/tenant/clients', {
        headers: { authorization: 'Bearer a-token-the-page-should-not-have' },
      }),
      ctx(['tenant', 'clients']),
    );

    const sent = (upstream.mock.calls[0]![1].headers as Record<string, string>).authorization;
    expect(sent).toBe('Bearer the-api-access-token');
  });

  it('NEVER forwards x-identity-id — 003/FR-041 removed that header for asserting an unverified identity', async () => {
    await GET(
      new Request('http://localhost:3000/api/lc/tenant/clients', {
        headers: { 'x-identity-id': 'somebody-else' },
      }),
      ctx(['tenant', 'clients']),
    );

    expect((upstream.mock.calls[0]![1].headers as Record<string, string>)['x-identity-id']).toBeUndefined();
  });

  it('refuses without reaching the API when nobody is signed in', async () => {
    readAccessToken.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost:3000/api/lc/tenant/clients'),
      ctx(['tenant', 'clients']),
    );

    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('preserves the API status and body verbatim, so refusals still classify', async () => {
    // `016a`'s `classifyRefusal` reads `status` and `body.error.code`. A proxy that
    // flattened either would turn every distinguishable refusal into an opaque one.
    upstream.mockResolvedValue(
      ok({ error: { code: 'entitlement_denied', message: 'No disponible en tu plan.' } }, 403),
    );

    const response = await GET(
      new Request('http://localhost:3000/api/lc/tenant/clients'),
      ctx(['tenant', 'clients']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'entitlement_denied', message: 'No disponible en tu plan.' },
    });
  });

  it('carries a JSON body through on write verbs', async () => {
    await POST(
      new Request('http://localhost:3000/api/lc/tenant/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ legalName: 'Constructora Peninsular, S.A. de C.V.' }),
      }),
      ctx(['tenant', 'clients']),
    );

    const [, init] = upstream.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBeDefined();
  });

  it('exposes the verbs the domain APIs actually use', () => {
    // 006 patches a client, 006/019 withdraw and restore, 007 uploads and deletes.
    expect(typeof PATCH).toBe('function');
    expect(typeof DELETE).toBe('function');
  });
});
