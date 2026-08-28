/**
 * T020 — 018/US1. The shape of the request `src/clients/api.ts` builds.
 *
 * **Why the request and not the response.** The response is `006`'s to get right and
 * `006`'s tests already hold it to that. What only this side can get wrong is the request:
 * a filter sent as an empty string instead of omitted, a cursor that someone decided to
 * parse, a `kind` field spread into an edit payload that `006` refuses outright. Every one
 * of those produces a *plausible* call that fails or, worse, silently asks a different
 * question than the person typed.
 *
 * The seam is `apiFetch`, mocked here. That is deliberate: contracts/client-screens.md §0
 * says every call goes through it and nothing else, so asserting on what reaches `apiFetch`
 * both checks the URL and proves the rule was followed — a call that built its own `fetch`
 * would drop the tenant and identity headers, and would show up here as a missing call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';
import {
  createClient,
  deactivateClient,
  listClients,
  reactivateClient,
  updateClient,
} from '@/clients/api';

const mockedFetch = vi.mocked(apiFetch);

/** The last path `apiFetch` was called with, parsed so query parameters can be asserted on. */
function lastRequest(): { path: string; params: URLSearchParams; init: RequestInit } {
  const calls = mockedFetch.mock.calls;
  expect(calls.length, 'nothing reached apiFetch — did the call build its own request?').toBeGreaterThan(0);
  const [path, init] = calls[calls.length - 1] as [string, RequestInit | undefined];
  const [pathname, query = ''] = path.split('?');
  return { path: pathname, params: new URLSearchParams(query), init: init ?? {} };
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('listClients builds the query 006 documents', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls the list route through apiFetch', async () => {
    await listClients({});
    expect(lastRequest().path).toBe('/tenant/clients');
  });

  it('sends q, status, limit and cursor when each is present', async () => {
    await listClients({ q: 'torres', status: 'active', limit: 50, cursor: 'opaque-cursor' });

    const { params } = lastRequest();
    expect(params.get('q')).toBe('torres');
    expect(params.get('status')).toBe('active');
    expect(params.get('limit')).toBe('50');
    expect(params.get('cursor')).toBe('opaque-cursor');
  });

  it('omits every parameter that was not given', async () => {
    await listClients({});

    const { params } = lastRequest();
    // Not `q=`, not `status=`: an empty parameter is a different question than no
    // parameter, and 006 is entitled to treat it as one.
    expect(params.has('q')).toBe(false);
    expect(params.has('status')).toBe(false);
    expect(params.has('cursor')).toBe(false);
  });

  it('omits a whitespace-only q rather than sending it empty', async () => {
    // 006/contracts/client-api.md §1: "Trimmed; an empty or whitespace-only value is
    // treated as absent, not as a match-nothing filter." The screen debounces typing, so
    // this case arrives whenever someone clears the box — the directory must come back
    // whole, not come back empty.
    await listClients({ q: '   ' });
    expect(lastRequest().params.has('q')).toBe(false);
  });

  it('trims a padded q instead of searching for the padding', async () => {
    await listClients({ q: '  torres  ' });
    expect(lastRequest().params.get('q')).toBe('torres');
  });

  it('passes the cursor back verbatim and never parses it', async () => {
    // data-model.md: the cursor is opaque. 001 encodes it and 006 returns it; the only
    // legitimate operations here are "send it back" and "check whether it is null". This
    // value is deliberately something that would tempt a decoder — base64-looking, with
    // padding and a colon in it.
    const cursor = 'eyJvY2N1cnJlZEF0IjoiMjAyNi0wOC0yN1QwMDowMDowMFoifQ==';
    await listClients({ cursor });
    expect(lastRequest().params.get('cursor')).toBe(cursor);
  });
});

describe('createClient converts the form values at the boundary', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({
      ok: true,
      data: { id: 'c1', kind: 'person', legalName: 'Juan Perez', rfc: null, status: 'active' },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('posts to the create route', async () => {
    await createClient({ kind: 'person', legalName: 'Juan Perez', rfc: '' });

    const { path, init } = lastRequest();
    expect(path).toBe('/tenant/clients');
    expect(init.method).toBe('POST');
  });

  it('sends a blank rfc as null, not as an empty string', async () => {
    // data-model.md, Boundary conversions. The form holds `''` because a controlled input
    // must; the wire wants `null` because that is what "not collected" means, and it is
    // what the directory renders as a dash.
    await createClient({ kind: 'person', legalName: 'Juan Perez', rfc: '   ' });
    expect(bodyOf(lastRequest().init).rfc).toBeNull();
  });

  it('trims the legal name and the rfc', async () => {
    await createClient({ kind: 'organization', legalName: '  Grupo Torres  ', rfc: '  GTO120315AB1 ' });

    const body = bodyOf(lastRequest().init);
    expect(body.legalName).toBe('Grupo Torres');
    expect(body.rfc).toBe('GTO120315AB1');
  });
});

describe('updateClient never sends kind', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({
      ok: true,
      data: { id: 'c1', kind: 'person', legalName: 'Juan Perez', rfc: null, status: 'active' },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('patches the record route', async () => {
    await updateClient('c1', { legalName: 'Juan Perez Hernandez', rfc: '' });

    const { path, init } = lastRequest();
    expect(path).toBe('/tenant/clients/c1');
    expect(init.method).toBe('PATCH');
  });

  it('omits kind entirely, even when the caller passes a whole client through', async () => {
    // The single most likely defect in this module: spread the client being edited into
    // the payload, send `kind` unchanged, and earn a 400 from 006 — which refuses a PATCH
    // naming `kind` at all, rather than ignoring it (006/contracts/client-api.md §3).
    // Written as an over-wide call on purpose, because that is how it happens.
    await updateClient('c1', {
      legalName: 'Juan Perez Hernandez',
      rfc: 'PEHJ850612XY3',
      // @ts-expect-error UpdateClientRequest has no `kind`; this asserts the runtime also drops it.
      kind: 'person',
      id: 'c1',
      status: 'active',
    });

    const body = bodyOf(lastRequest().init);
    expect(body).not.toHaveProperty('kind');
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('status');
  });

  it('sends a cleared rfc as null so it can actually be erased', async () => {
    await updateClient('c1', { rfc: '' });
    expect(bodyOf(lastRequest().init).rfc).toBeNull();
  });

  it('omits a field the caller did not name, so it is left alone', async () => {
    // 006: "every field optional; omitted fields are unchanged". Sending
    // `legalName: undefined` as `null` would blank a name nobody edited.
    await updateClient('c1', { rfc: 'PEHJ850612XY3' });
    expect(bodyOf(lastRequest().init)).not.toHaveProperty('legalName');
  });
});

describe('the two status routes', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({ ok: true, data: { id: 'c1', status: 'inactive', deactivatedAt: '2026-08-28' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('posts to deactivate', async () => {
    await deactivateClient('c1');
    const { path, init } = lastRequest();
    expect(path).toBe('/tenant/clients/c1/deactivate');
    expect(init.method).toBe('POST');
  });

  it('posts to reactivate', async () => {
    await reactivateClient('c1');
    const { path, init } = lastRequest();
    expect(path).toBe('/tenant/clients/c1/reactivate');
    expect(init.method).toBe('POST');
  });
});

describe('failures reach the caller in the shape QueryBoundary expects', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with {status, body} when the server refuses', async () => {
    // `016a`'s classifyRefusal reads the status and the body; an Error would lose both.
    const body = { error: { code: 'permission_denied', message: 'no' } };
    mockedFetch.mockResolvedValue({ ok: false, status: 403, body });

    await expect(listClients({})).rejects.toEqual({ status: 403, body });
  });

  it('rejects with null when there was no response at all', async () => {
    // A network failure has no status to classify, and `016a` buckets it as opaque.
    mockedFetch.mockResolvedValue({ ok: false, status: null, body: null });

    await expect(listClients({})).rejects.toBeNull();
  });
});
