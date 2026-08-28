/**
 * T020, T021, T022 — 019/US1, quickstart Scenario 1. The case register.
 *
 * Three groups, answering different questions.
 *
 * **T020 — what the reader sees.** Six columns, `—` for what the record genuinely lacks, a
 * date that is not a day early, and a badge that distinguishes a closing status from an open
 * one *because the catalog said so* and not because of what the status is called.
 *
 * **T021 — three empty states, and they must read differently.** `018` had two; this screen
 * has three, and the new pair is the interesting one. "This firm has no matters" and "you
 * are on none of this firm's matters" are different situations with different next actions,
 * and a paralegal told the firm has no cases would reasonably conclude the product is
 * broken.
 *
 * **T022 — what the screen does not do.** It does not filter. `006` filters inside the query
 * before the page boundary, so a page of 50 is 50 matching matters the caller may see. A
 * screen that re-filters shortens pages while "Cargar más" still promises more — and it
 * would do so invisibly, because the rows it drops are rows the server deliberately sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

vi.mock('@/session/principal', () => ({
  getPrincipal: vi.fn().mockResolvedValue({ identityId: 'identity-1', memberships: [] }),
}));
vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { CaseRegister } from '@/app/expedientes/CaseRegister';
import type { CaseListItem } from '@/cases/types';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

/**
 * A *factory*, not a value. A `Response` body can be read once; handing the same instance to
 * `mockResolvedValue` makes the second call throw "Body already read", which surfaces three
 * layers away as a mangled refusal and looks like a bug in the screen.
 */
function respondWith(body: unknown, status = 200): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );
}

const STATUS_OPEN = { id: 'st-open', name: 'En Proceso' };
const STATUS_CLOSED = { id: 'st-closed', name: 'Concluido' };

const TORRES: CaseListItem = {
  id: 'c1',
  fileNumber: 'EXP-2026-0042',
  client: { id: 'cl1', legalName: 'Grupo Torres, S.A. de C.V.' },
  status: STATUS_OPEN,
  matterType: { id: 'mt1', name: 'Mercantil' },
  venue: { id: 'v1', name: 'Juzgado 4° Civil CDMX' },
  venueCaseReference: '1234/2026',
  openedOn: '2026-03-04',
  closedOn: null,
};

/** No type, no venue — the record genuinely lacks both. And it is closed. */
const MINIMO: CaseListItem = {
  id: 'c2',
  fileNumber: 'EXP-2026-0043',
  client: { id: 'cl2', legalName: 'Juan Perez' },
  status: STATUS_CLOSED,
  matterType: null,
  venue: null,
  venueCaseReference: null,
  openedOn: '2026-01-01',
  closedOn: '2026-08-27',
};

const CATALOGS = {
  'case-statuses': {
    items: [
      { id: 'st-open', name: 'En Proceso', status: 'active', isClosing: false },
      { id: 'st-closed', name: 'Concluido', status: 'active', isClosing: true },
    ],
  },
  'matter-types': { items: [{ id: 'mt1', name: 'Mercantil', status: 'active' }] },
  venues: { items: [{ id: 'v1', name: 'Juzgado 4° Civil CDMX', status: 'active' }] },
};

/**
 * Routes each request to the right payload. The register makes four calls — the list and
 * three catalogs — so a single blanket mock would answer them all with the same body.
 */
function router(
  listBody: unknown,
  options: { listStatus?: number; catalogsFail?: boolean } = {},
) {
  return (input: string) => {
    const url = String(input);
    if (url.includes('/tenant/case-catalogs/')) {
      if (options.catalogsFail) {
        return respondWith({ error: { code: 'internal_error', message: 'x' } }, 500)();
      }
      const key = Object.keys(CATALOGS).find((k) => url.includes(k)) as keyof typeof CATALOGS;
      return respondWith(CATALOGS[key])();
    }
    return respondWith(listBody, options.listStatus ?? 200)();
  };
}

/** The query string of the last case-list request, so filter behaviour can be asserted on. */
function lastListParams(fetchMock: ReturnType<typeof vi.fn>): URLSearchParams {
  const calls = fetchMock.mock.calls.filter((c) => {
    const url = String(c[0]);
    return url.includes('/tenant/cases') && !url.includes('case-catalogs');
  });
  expect(calls.length, 'no case-list request was made').toBeGreaterThan(0);
  const url = String(calls[calls.length - 1]![0]);
  return new URLSearchParams(url.split('?')[1] ?? '');
}

function countListCalls(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter((c) => {
    const url = String(c[0]);
    return url.includes('/tenant/cases') && !url.includes('case-catalogs');
  }).length;
}

describe('the register renders what 006 returned', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the six columns', async () => {
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);

    for (const header of ['Número', 'Cliente', 'Tipo', 'Juzgado', 'Fecha Inicio', 'Estado']) {
      expect(await screen.findByRole('columnheader', { name: header })).toBeInTheDocument();
    }
  });

  it('does not show an Abogado column', async () => {
    // Spec Decision 2, asserted rather than merely omitted. No table in the product stores a
    // person's name, and a column of email addresses is not the column the design asked for.
    // If this ever fails, identity has landed and the column is worth revisiting deliberately.
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('columnheader', { name: 'Número' });

    expect(screen.queryByRole('columnheader', { name: /abogado/i })).toBeNull();
  });

  it("puts the record's fields in one row", async () => {
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);

    const row = await screen.findByRole('row', { name: /EXP-2026-0042/ });
    expect(within(row).getByText('Grupo Torres, S.A. de C.V.')).toBeInTheDocument();
    expect(within(row).getByText('Mercantil')).toBeInTheDocument();
    expect(within(row).getByText('Juzgado 4° Civil CDMX')).toBeInTheDocument();
  });

  it('renders the opening date as the day it says', async () => {
    // research D5. A `Date`-based implementation shows 03/03/2026 here.
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);

    const row = await screen.findByRole('row', { name: /EXP-2026-0042/ });
    expect(within(row).getByText('04/03/2026')).toBeInTheDocument();
  });

  it('shows a dash where the record genuinely has no type and no venue', async () => {
    // FR-004. A blank cell reads as a rendering fault; a dash reads as a fact.
    fetchMock.mockImplementation(router({ items: [MINIMO], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);

    const row = await screen.findByRole('row', { name: /EXP-2026-0043/ });
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});

describe('the status badge signals what the catalog declares, and nothing else', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks a closing status differently from an open one', async () => {
    fetchMock.mockImplementation(router({ items: [TORRES, MINIMO], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);

    const open = within(await screen.findByRole('row', { name: /EXP-2026-0042/ }));
    const closed = within(await screen.findByRole('row', { name: /EXP-2026-0043/ }));

    await waitFor(() => {
      expect(open.getByTestId('case-status-badge')).toHaveAttribute('data-closing', 'false');
    });
    expect(closed.getByTestId('case-status-badge')).toHaveAttribute('data-closing', 'true');
  });

  it('reads the flag from the catalog and never from the name', async () => {
    /*
     * Q3, and the assertion that stops the obvious shortcut. This firm's closing status is
     * called "En Proceso" — an absurd name, and entirely legal: statuses are a per-tenant
     * catalog of free text, and `isClosing` is the only declaration the product may rely on.
     * An implementation that matched on the string gets this backwards.
     */
    fetchMock.mockImplementation((input: string) => {
      if (String(input).includes('case-catalogs/case-statuses')) {
        return respondWith({
          items: [{ id: 'st-open', name: 'En Proceso', status: 'active', isClosing: true }],
        })();
      }
      if (String(input).includes('case-catalogs')) return respondWith({ items: [] })();
      return respondWith({ items: [TORRES], nextCursor: null })();
    });

    renderWithClient(<CaseRegister archetype="MP" />);

    const row = within(await screen.findByRole('row', { name: /EXP-2026-0042/ }));
    await waitFor(() => {
      expect(row.getByTestId('case-status-badge')).toHaveAttribute('data-closing', 'true');
    });
  });

  it('degrades to neutral when the catalog read fails but the list succeeds', async () => {
    // The register is the point of the screen; a decoration failing must not take it down.
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }, { catalogsFail: true }));

    renderWithClient(<CaseRegister archetype="MP" />);

    const row = within(await screen.findByRole('row', { name: /EXP-2026-0042/ }));
    expect(row.getByTestId('case-status-badge')).toHaveAttribute('data-closing', 'unknown');
    // And the status still reads.
    expect(row.getByText('En Proceso')).toBeInTheDocument();
  });
});

describe('the states are mutually distinguishable', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the error state, with retry, when the list call fails', async () => {
    fetchMock.mockImplementation(
      router({ error: { code: 'internal_error', message: 'boom' } }, { listStatus: 500 }),
    );

    renderWithClient(<CaseRegister archetype="MP" />);

    expect(await screen.findByTestId('error-state')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('tells an MP the firm has no matters', async () => {
    // MP sees everything, so an empty register genuinely means the firm has none.
    fetchMock.mockImplementation(router({ items: [], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);

    const guidance = await screen.findByTestId('empty-state-guidance');
    expect(guidance.textContent ?? '').toMatch(/despacho a[uú]n no tiene expedientes/i);
  });

  it('tells a PL they have none assigned', async () => {
    // The same empty response, a different situation, and it must not be the same sentence.
    fetchMock.mockImplementation(router({ items: [], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="PL" />);

    const guidance = await screen.findByTestId('empty-state-guidance');
    expect(guidance.textContent ?? '').toMatch(/no tienes expedientes asignados/i);
  });

  it('gives the two no-filter empty states different text', async () => {
    /*
     * Captured in one test rather than inferred from the two above, because "both render
     * EmptyState" is exactly the defect. A paralegal told the firm has no matters would
     * reasonably conclude the product is broken and stop looking.
     */
    fetchMock.mockImplementation(router({ items: [], nextCursor: null }));

    const first = renderWithClient(<CaseRegister archetype="MP" />);
    const asMp = (await screen.findByTestId('empty-state-guidance')).textContent ?? '';
    first.unmount();

    renderWithClient(<CaseRegister archetype="PL" />);
    const asPl = (await screen.findByTestId('empty-state-guidance')).textContent ?? '';

    expect(asPl).not.toBe(asMp);
  });

  it('names what was searched when a filter matched nothing', async () => {
    /*
     * Routed by URL, not by call order. `mockImplementationOnce` would be consumed by
     * whichever request happens to go out first — and three of the four are catalogs, so
     * the "first" call is almost never the list. Deciding on the presence of `q` is the only
     * ordering-independent way to say "empty once a filter is applied".
     */
    fetchMock.mockImplementation((input: string) => {
      const url = String(input);
      if (url.includes('case-catalogs')) return router({})(url);
      return url.includes('q=')
        ? respondWith({ items: [], nextCursor: null })()
        : respondWith({ items: [TORRES], nextCursor: null })();
    });

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'zzz');

    const guidance = await screen.findByTestId('empty-state-guidance', undefined, { timeout: 3000 });
    expect(guidance.textContent ?? '').toContain('zzz');
  });

  it('never renders two states at once', async () => {
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    expect(screen.queryByTestId('loading-state')).toBeNull();
    expect(screen.queryByTestId('error-state')).toBeNull();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('filtering asks 006 the question, and renders its answer unchanged', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders every item the response contained, however many', async () => {
    /*
     * FR-003. The response deliberately contains matters that do NOT match the typed term:
     * 006 already applied the filter server-side, and a screen that re-applies it would drop
     * rows 006 sent on purpose — shortening a page that "Cargar más" still says has a
     * successor.
     */
    const items: CaseListItem[] = Array.from({ length: 12 }, (_, i) => ({
      ...TORRES,
      id: `c${i}`,
      fileNumber: `EXP-2026-${String(i).padStart(4, '0')}`,
      client: { id: `cl${i}`, legalName: i % 2 === 0 ? `Torres ${i}` : `Alguien Mas ${i}` },
    }));
    fetchMock.mockImplementation(router({ items, nextCursor: 'next' }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0000/ });

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'torres');

    await waitFor(() => {
      // 12 data rows plus the header row.
      expect(screen.getAllByRole('row')).toHaveLength(items.length + 1);
    });
    expect(screen.getByText('Alguien Mas 1')).toBeInTheDocument();
  });

  it('sends the typed term to the server', async () => {
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'torres');

    await waitFor(() => {
      expect(lastListParams(fetchMock).get('q')).toBe('torres');
    });
  });

  it('settles a burst of typing into one request', async () => {
    // Without the debounce, "torres" is six requests whose responses can arrive out of order,
    // so the register flickers and may settle on the answer to "torr".
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });
    const before = countListCalls(fetchMock);

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'torres');

    await waitFor(() => {
      expect(lastListParams(fetchMock).get('q')).toBe('torres');
    });
    expect(countListCalls(fetchMock) - before).toBeLessThanOrEqual(2);
  });

  it('restores the whole register when the box is cleared', async () => {
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    const box = screen.getByRole('searchbox', { name: /buscar/i });
    await userEvent.type(box, 'torres');
    await waitFor(() => expect(lastListParams(fetchMock).get('q')).toBe('torres'));

    await userEvent.clear(box);

    await waitFor(() => {
      // Absent, not empty. `q=` asks 006 a different question than asking nothing.
      expect(lastListParams(fetchMock).has('q')).toBe(false);
    });
  });

  it('sends the matter-type filter when one is chosen', async () => {
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    await userEvent.click(screen.getByRole('combobox', { name: /tipo/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mercantil' }));

    await waitFor(() => {
      expect(lastListParams(fetchMock).get('matterTypeId')).toBe('mt1');
    });
  });

  it('sends the venue filter when one is chosen', async () => {
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    await userEvent.click(screen.getByRole('combobox', { name: /juzgado/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Juzgado 4° Civil CDMX' }));

    await waitFor(() => {
      expect(lastListParams(fetchMock).get('venueId')).toBe('v1');
    });
  });
});

describe('paging is forward-only and cursor-driven', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers "Cargar más" only while nextCursor is non-null', async () => {
    fetchMock.mockImplementation(router({ items: [TORRES], nextCursor: null }));

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    expect(screen.queryByRole('button', { name: /cargar m[aá]s/i })).toBeNull();
  });

  it('sends the cursor back verbatim and appends the next page', async () => {
    const cursor = 'eyJvY2N1cnJlZEF0IjoiMjAyNi0wOC0yN1QwMDowMDowMFoifQ==';
    let listCalls = 0;
    fetchMock.mockImplementation((input: string) => {
      const url = String(input);
      if (url.includes('case-catalogs')) return router({})(url);
      listCalls += 1;
      return listCalls === 1
        ? respondWith({ items: [TORRES], nextCursor: cursor })()
        : respondWith({ items: [MINIMO], nextCursor: null })();
    });

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    await userEvent.click(screen.getByRole('button', { name: /cargar m[aá]s/i }));

    expect(await screen.findByRole('row', { name: /EXP-2026-0043/ })).toBeInTheDocument();
    // The first page is still there — this pages, it does not replace.
    expect(screen.getByRole('row', { name: /EXP-2026-0042/ })).toBeInTheDocument();
    expect(lastListParams(fetchMock).get('cursor')).toBe(cursor);
  });

  it('resets the cursor when a filter changes', async () => {
    // Otherwise page 2 of the old filter is requested against the new one, and the reader
    // lands in the middle of a set they are no longer looking at.
    let listCalls = 0;
    fetchMock.mockImplementation((input: string) => {
      const url = String(input);
      if (url.includes('case-catalogs')) return router({})(url);
      listCalls += 1;
      return listCalls === 1
        ? respondWith({ items: [TORRES], nextCursor: 'page-2' })()
        : respondWith({ items: [MINIMO], nextCursor: null })();
    });

    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });
    await userEvent.click(screen.getByRole('button', { name: /cargar m[aá]s/i }));
    await screen.findByRole('row', { name: /EXP-2026-0043/ });

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'torres');

    await waitFor(() => {
      const params = lastListParams(fetchMock);
      expect(params.get('q')).toBe('torres');
      expect(params.has('cursor')).toBe(false);
    });
  });
});
