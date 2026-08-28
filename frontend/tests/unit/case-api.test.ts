/**
 * T019 — 019/US1. The shape of the request `src/cases/api.ts` builds.
 *
 * **Why the request and not the response.** The response is `006`'s to get right and `006`'s
 * tests hold it to that. What only this side can get wrong is the request: a filter sent as
 * an empty string instead of omitted, a cursor somebody decided to parse, a status change
 * carrying a `closedOn` that `006` refuses outright. Each produces a *plausible* call that
 * fails — or, worse, silently asks a different question than the person typed.
 *
 * The seam is `apiFetch`, mocked here. That is deliberate: contracts/case-screens.md §0 says
 * every call goes through it and nothing else, so asserting on what reaches `apiFetch` both
 * checks the URL and proves the rule was kept — a call that built its own `fetch` would drop
 * the tenant and identity headers and show up here as a missing call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';
import {
  changeCaseStatus,
  createCase,
  listCaseCatalog,
  listCases,
  readCase,
} from '@/cases/api';

const mockedFetch = vi.mocked(apiFetch);

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

describe('listCases builds the query 006 documents', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls the list route through apiFetch', async () => {
    await listCases({});
    expect(lastRequest().path).toBe('/tenant/cases');
  });

  it('sends every filter that is present', async () => {
    await listCases({
      q: 'torres',
      matterTypeId: 'mt-1',
      venueId: 'v-1',
      limit: 50,
      cursor: 'opaque-cursor',
    });

    const { params } = lastRequest();
    expect(params.get('q')).toBe('torres');
    expect(params.get('matterTypeId')).toBe('mt-1');
    expect(params.get('venueId')).toBe('v-1');
    expect(params.get('limit')).toBe('50');
    expect(params.get('cursor')).toBe('opaque-cursor');
  });

  it('omits every filter that was not given', async () => {
    await listCases({});

    const { params } = lastRequest();
    // Not `q=`, not `matterTypeId=`. An empty parameter is a different question than no
    // parameter, and 006 is entitled to treat it as one.
    expect(params.has('q')).toBe(false);
    expect(params.has('matterTypeId')).toBe(false);
    expect(params.has('venueId')).toBe(false);
    expect(params.has('cursor')).toBe(false);
  });

  it('omits a whitespace-only q rather than sending it empty', async () => {
    // The register debounces typing, so this arrives whenever someone clears the search box.
    // The register must come back whole, not come back empty.
    await listCases({ q: '   ' });
    expect(lastRequest().params.has('q')).toBe(false);
  });

  it('trims a padded q instead of searching for the padding', async () => {
    await listCases({ q: '  torres  ' });
    expect(lastRequest().params.get('q')).toBe('torres');
  });

  it('passes the cursor back verbatim and never parses it', async () => {
    // Deliberately something that would tempt a decoder — base64-shaped, with padding.
    const cursor = 'eyJvY2N1cnJlZEF0IjoiMjAyNi0wOC0yN1QwMDowMDowMFoifQ==';
    await listCases({ cursor });
    expect(lastRequest().params.get('cursor')).toBe(cursor);
  });
});

describe('listCaseCatalog', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({ ok: true, data: { items: [] } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['case-statuses'],
    ['matter-types'],
    ['venues'],
  ] as const)('reads the %s catalog', async (catalog) => {
    await listCaseCatalog(catalog);
    expect(lastRequest().path).toBe(`/tenant/case-catalogs/${catalog}`);
  });
});

describe('readCase', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads one case by id', async () => {
    mockedFetch.mockResolvedValue({ ok: true, data: { id: 'c1' } });
    await readCase('c1');
    expect(lastRequest().path).toBe('/tenant/cases/c1');
  });
});

describe('createCase converts the form values at the boundary', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({ ok: true, data: { id: 'new' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('posts to the create route', async () => {
    await createCase({
      clientId: 'cl-1',
      fileNumber: 'EXP-2026-0042',
      caseStatusId: 'st-1',
      matterTypeId: '',
      venueId: '',
      venueCaseReference: '',
      openedOn: '',
    });

    const { path, init } = lastRequest();
    expect(path).toBe('/tenant/cases');
    expect(init.method).toBe('POST');
  });

  it('omits an empty optional entirely rather than sending null or an empty string', async () => {
    // data-model.md's boundary rule. `006` treats a missing `openedOn` as "today"; an empty
    // string is a malformed date and earns a 400 for a field the person left alone.
    await createCase({
      clientId: 'cl-1',
      fileNumber: 'EXP-2026-0042',
      caseStatusId: 'st-1',
      matterTypeId: '',
      venueId: '',
      venueCaseReference: '',
      openedOn: '',
    });

    const body = bodyOf(lastRequest().init);
    expect(body).not.toHaveProperty('matterTypeId');
    expect(body).not.toHaveProperty('venueId');
    expect(body).not.toHaveProperty('venueCaseReference');
    expect(body).not.toHaveProperty('openedOn');
  });

  it('trims the file number and the court reference', async () => {
    await createCase({
      clientId: 'cl-1',
      fileNumber: '  EXP-2026-0042  ',
      caseStatusId: 'st-1',
      matterTypeId: 'mt-1',
      venueId: 'v-1',
      venueCaseReference: '  1234/2026 ',
      openedOn: '2026-03-04',
    });

    const body = bodyOf(lastRequest().init);
    expect(body.fileNumber).toBe('EXP-2026-0042');
    expect(body.venueCaseReference).toBe('1234/2026');
    expect(body.openedOn).toBe('2026-03-04');
  });
});

describe('changeCaseStatus sends the status and nothing else', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({ ok: true, data: { id: 'c1', status: {}, closedOn: null } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('patches the status route', async () => {
    await changeCaseStatus('c1', 'st-2');

    const { path, init } = lastRequest();
    expect(path).toBe('/tenant/cases/c1/status');
    expect(init.method).toBe('PATCH');
  });

  it('never sends closedOn, even when a caller passes a whole record through', async () => {
    /*
     * The single most likely defect in this module: assemble the payload by spreading the
     * loaded case, send `closedOn` back unchanged, and earn a `400` from 006 — which refuses
     * a request naming the field at all rather than ignoring it. Written as an over-wide
     * call on purpose, because that is how it happens.
     */
    await changeCaseStatus('c1', 'st-2');

    const body = bodyOf(lastRequest().init);
    expect(Object.keys(body)).toEqual(['caseStatusId']);
    expect(body).not.toHaveProperty('closedOn');
  });
});

describe('failures reach the caller in the shape QueryBoundary expects', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with {status, body} when the server refuses', async () => {
    // `016a`'s classifyRefusal reads the status and the body; an Error would lose both, and
    // every refusal would classify as opaque.
    const body = { error: { code: 'not_found', message: 'no' } };
    mockedFetch.mockResolvedValue({ ok: false, status: 404, body });

    await expect(readCase('c1')).rejects.toEqual({ status: 404, body });
  });

  it('rejects with null when there was no response at all', async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: null, body: null });

    await expect(listCases({})).rejects.toBeNull();
  });
});
