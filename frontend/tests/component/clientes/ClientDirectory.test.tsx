/**
 * T021, T022 — 018/US1, quickstart Scenario 2. The client directory.
 *
 * Two groups of assertions live here, and they answer different questions.
 *
 * **T021 — what the reader sees.** The four columns, the dash for a missing RFC, and the
 * five states being mutually distinguishable. The state assertions are the load-bearing
 * ones: `016a` gives this screen four states off the shelf and the failure mode is not
 * that one is missing, it is that two of them render the same thing. A firm with no
 * clients and a search that matched nothing are *different situations with different next
 * actions*, and a screen that says "Aún no hay nada aquí" to both has told neither person
 * what to do (FR-004, SC-005).
 *
 * **T022 — what the screen does not do.** It does not filter. `006` filters inside the
 * query, before the page boundary, so a page of 50 is 50 matching clients and `nextCursor`
 * refers to the next page of matches. If this screen filters the response again, pages
 * shrink while "Cargar más" still promises more — and `006`'s SC-007a, which `006` itself
 * verified, is quietly broken from the one place `006` cannot see. The assertion is blunt
 * on purpose: given N items, render N.
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

import { ClientDirectory } from '@/app/clientes/ClientDirectory';
import type { Client } from '@/clients/types';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/**
 * A *factory*, not a value.
 *
 * `Response` bodies can be read exactly once. Handing the same instance to
 * `mockResolvedValue` makes the second call to `apiFetch` throw "Body already read" — which
 * surfaces as a mangled refusal three layers away, and looks like a bug in the screen.
 */
function respondWith(body: unknown, status = 200): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );
}

const GRUPO_TORRES: Client = {
  id: 'c1',
  kind: 'organization',
  legalName: 'Grupo Torres, S.A. de C.V.',
  rfc: 'GTO120315AB1',
  status: 'active',
};

const JUAN_PEREZ: Client = {
  id: 'c2',
  kind: 'person',
  legalName: 'Juan Perez',
  rfc: null,
  status: 'inactive',
};

/** The query string of the nth call to `fetch`, so filter behaviour can be asserted on. */
function requestParams(fetchMock: ReturnType<typeof vi.fn>, index: number): URLSearchParams {
  const call = fetchMock.mock.calls[index] as [string, RequestInit] | undefined;
  expect(call, `no request at index ${index}`).toBeDefined();
  return new URLSearchParams((call as [string, RequestInit])[0].split('?')[1] ?? '');
}

describe('the directory renders what 006 returned', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the record's four facts on the client's own card", async () => {
    // The directory is a card grid, not a table. Each card is an `article` named by the
    // client, which is what lets these assertions be scoped to one client rather than to
    // "somewhere on the page" — the same guarantee the table row gave.
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);

    const card = await screen.findByRole('article', { name: /Grupo Torres/ });
    expect(within(card).getByText('Grupo Torres, S.A. de C.V.')).toBeInTheDocument();
    expect(within(card).getByText('GTO120315AB1')).toBeInTheDocument();
    // Spanish, and the domain's words: "organización" not "organization", "activo" not
    // "active" (FR-020). The wire's vocabulary does not reach the reader.
    expect(within(card).getAllByText(/Organizaci/i).length).toBeGreaterThan(0);
    expect(within(card).getAllByText(/Activo/i).length).toBeGreaterThan(0);
  });

  it('shows a dash rather than an empty cell when a client has no RFC', async () => {
    // `rfc` is null, not ''. An empty cell reads as a rendering fault; a dash reads as
    // "we do not have this" — which is a fact about the record, not about the page.
    fetchMock.mockImplementation(respondWith({ items: [JUAN_PEREZ], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);

    const card = await screen.findByRole('article', { name: /Juan Perez/ });
    expect(within(card).getByText('—')).toBeInTheDocument();
  });

  it('says "retirado" for a withdrawn client, never "inactive"', async () => {
    fetchMock.mockImplementation(respondWith({ items: [JUAN_PEREZ], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);

    const card = await screen.findByRole('article', { name: /Juan Perez/ });
    expect(within(card).getAllByText(/Retirado/i).length).toBeGreaterThan(0);
    expect(within(card).queryByText(/inactive/i)).toBeNull();
  });

  it('lists inactive clients alongside active ones', async () => {
    // 006/contracts/client-api.md §1: withdrawal bars new cases, it does not hide the
    // record from a firm that still has open matters against that party.
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES, JUAN_PEREZ], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);

    expect(await screen.findByText('Grupo Torres, S.A. de C.V.')).toBeInTheDocument();
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
  });
});

describe('the five states are mutually distinguishable', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the error state, with retry, when the call fails', async () => {
    fetchMock.mockImplementation(respondWith({ error: { code: 'internal_error', message: 'boom' } }, 500));

    renderWithClient(<ClientDirectory archetype="MP" />);

    const error = await screen.findByTestId('error-state');
    expect(error).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  it('renders a first-run empty state, pointing at how to add the first client', async () => {
    fetchMock.mockImplementation(respondWith({ items: [], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);

    const guidance = await screen.findByTestId('empty-state-guidance');
    expect(guidance.textContent ?? '').toMatch(/a[uú]n no tiene clientes/i);
  });

  it('renders a no-matches empty state that names what was searched', async () => {
    fetchMock
      .mockImplementationOnce(respondWith({ items: [GRUPO_TORRES], nextCursor: null }))
      .mockImplementation(respondWith({ items: [], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'zzz');

    const guidance = await screen.findByTestId('empty-state-guidance', undefined, { timeout: 3000 });
    // Names the term, so the reader can see they searched what they think they searched.
    expect(guidance.textContent ?? '').toContain('zzz');
  });

  it('gives the two empty states different text', async () => {
    // SC-005, and the whole point of the pair. Captured in one test rather than inferred
    // from the two above, because "both render EmptyState" is exactly the defect.
    fetchMock.mockImplementation(respondWith({ items: [], nextCursor: null }));

    const first = renderWithClient(<ClientDirectory archetype="MP" />);
    const firstRun = (await screen.findByTestId('empty-state-guidance')).textContent ?? '';
    first.unmount();

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByTestId('empty-state-guidance');
    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'zzz');

    await waitFor(async () => {
      const filtered = (await screen.findByTestId('empty-state-guidance')).textContent ?? '';
      expect(filtered).not.toBe(firstRun);
    });
  });

  it('offers a control to clear the filter from the no-matches state', async () => {
    fetchMock.mockImplementation(respondWith({ items: [], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'zzz');
    await screen.findByTestId('empty-state-guidance');

    const clear = await screen.findByRole('button', { name: /limpiar/i });
    await userEvent.click(clear);

    expect((screen.getByRole('searchbox', { name: /buscar/i }) as HTMLInputElement).value).toBe('');
  });

  it('never renders two states at once', async () => {
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

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
    // FR-003, and the assertion that protects 006's SC-007a. The response deliberately
    // contains clients that do NOT match the typed term: 006 already applied the filter
    // server-side, and a screen that re-applies it would drop rows 006 sent on purpose —
    // shortening a page that "Cargar más" still says has a successor.
    const items: Client[] = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      kind: 'person',
      legalName: i % 2 === 0 ? `Torres ${i}` : `Alguien Mas ${i}`,
      rfc: null,
      status: 'active',
    }));
    fetchMock.mockImplementation(respondWith({ items, nextCursor: 'next' }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Torres 0');

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'torres');

    await waitFor(() => {
      // One card per item returned. No header row to discount — the grid has no chrome of
      // its own, which makes this assertion read as exactly what FR-003 says.
      expect(screen.getAllByRole('article')).toHaveLength(items.length);
    });
    expect(screen.getByText('Alguien Mas 1')).toBeInTheDocument();
  });

  it('sends the typed term to the server rather than filtering locally', async () => {
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'torres');

    await waitFor(() => {
      const latest = requestParams(fetchMock, fetchMock.mock.calls.length - 1);
      expect(latest.get('q')).toBe('torres');
    });
  });

  it('settles a burst of typing into one request', async () => {
    // The field debounces. Without it, "torres" is six requests whose responses can
    // arrive out of order, so the list flickers and may settle on the answer to "torr".
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');
    const before = fetchMock.mock.calls.length;

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'torres');

    await waitFor(() => {
      expect(requestParams(fetchMock, fetchMock.mock.calls.length - 1).get('q')).toBe('torres');
    });
    // Six keystrokes, at most a couple of requests — not one per character.
    expect(fetchMock.mock.calls.length - before).toBeLessThanOrEqual(2);
  });

  it('restores the whole directory when the box is cleared', async () => {
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    const box = screen.getByRole('searchbox', { name: /buscar/i });
    await userEvent.type(box, 'torres');
    await waitFor(() => {
      expect(requestParams(fetchMock, fetchMock.mock.calls.length - 1).get('q')).toBe('torres');
    });

    await userEvent.clear(box);

    await waitFor(() => {
      // Absent, not empty: `q=` asks 006 a different question than asking nothing, and
      // the directory must come back whole.
      expect(requestParams(fetchMock, fetchMock.mock.calls.length - 1).has('q')).toBe(false);
    });
  });

  it('sends the status filter when one is chosen', async () => {
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    // The status filter is the design system's `Select`, not a native one, so it is
    // driven the way a person drives it: open the trigger, choose the option.
    await userEvent.click(screen.getByRole('combobox', { name: /estado/i }));
    await userEvent.click(await screen.findByRole('option', { name: /retirados/i }));

    await waitFor(() => {
      expect(requestParams(fetchMock, fetchMock.mock.calls.length - 1).get('status')).toBe('inactive');
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
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    expect(screen.queryByRole('button', { name: /cargar m[aá]s/i })).toBeNull();
  });

  it('sends the cursor back verbatim and appends the next page', async () => {
    const cursor = 'eyJvY2N1cnJlZEF0IjoiMjAyNi0wOC0yN1QwMDowMDowMFoifQ==';
    fetchMock
      .mockImplementationOnce(respondWith({ items: [GRUPO_TORRES], nextCursor: cursor }))
      .mockImplementation(respondWith({ items: [JUAN_PEREZ], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    await userEvent.click(screen.getByRole('button', { name: /cargar m[aá]s/i }));

    expect(await screen.findByText('Juan Perez')).toBeInTheDocument();
    // The first page is still on screen — this pages, it does not replace.
    expect(screen.getByText('Grupo Torres, S.A. de C.V.')).toBeInTheDocument();
    expect(requestParams(fetchMock, 1).get('cursor')).toBe(cursor);
  });

  it('resets the cursor when a filter changes', async () => {
    // Otherwise page 2 of the old filter is requested against the new one, and the reader
    // gets a page from the middle of a set they are no longer looking at.
    fetchMock
      .mockImplementationOnce(respondWith({ items: [GRUPO_TORRES], nextCursor: 'page-2' }))
      .mockImplementation(respondWith({ items: [JUAN_PEREZ], nextCursor: null }));

    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');
    await userEvent.click(screen.getByRole('button', { name: /cargar m[aá]s/i }));
    await screen.findByText('Juan Perez');

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'torres');

    await waitFor(() => {
      const latest = requestParams(fetchMock, fetchMock.mock.calls.length - 1);
      expect(latest.get('q')).toBe('torres');
      expect(latest.has('cursor')).toBe(false);
    });
  });
});

describe('controls are gated on capability, not on an archetype list', () => {
  /*
   * T035, data-model.md's control map. These assertions are about what is *offered*, never
   * about what is permitted — the server refuses the underlying request identically whether
   * or not a button rendered (FR-015), and `016a`'s `hidden-item-still-refused.spec.ts`
   * holds that separately.
   *
   * The archetypes here are read off 006/spec.md rows 26 and 27: MP, PL, BM and SA hold
   * create and update; AA and CM read the directory and do not add to it.
   */
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES], nextCursor: null }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers "Nuevo cliente" to an archetype holding client.create', async () => {
    renderWithClient(<ClientDirectory archetype="PL" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    expect(screen.getByRole('button', { name: /nuevo cliente/i })).toBeInTheDocument();
  });

  it('withholds it from an archetype that only reads', async () => {
    // AA holds row 25 and not row 26 — it can see the directory and cannot add to it.
    renderWithClient(<ClientDirectory archetype="AA" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    expect(screen.queryByRole('button', { name: /nuevo cliente/i })).toBeNull();
  });

  it('offers "Editar" per row to an archetype holding client.update', async () => {
    renderWithClient(<ClientDirectory archetype="BM" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    expect(
      screen.getByRole('button', { name: /editar grupo torres/i }),
    ).toBeInTheDocument();
  });

  it('withholds "Editar", and the whole action row with it, from an archetype without client.update', async () => {
    renderWithClient(<ClientDirectory archetype="CM" />);
    const card = await screen.findByRole('article', { name: /Grupo Torres/ });

    expect(within(card).queryByRole('button', { name: /editar/i })).toBeNull();
    // CM holds neither update nor deactivate, so the card carries no controls at all —
    // no empty footer left behind where they would have been.
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
  });

  it('opens the create form from the button', async () => {
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    await userEvent.click(screen.getByRole('button', { name: /nuevo cliente/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/nuevo cliente/i)).toBeInTheDocument();
    // Create mode: `kind` is choosable.
    expect(within(dialog).getByRole('radio', { name: /persona/i })).toBeInTheDocument();
  });

  it('opens the edit form on the row it was clicked from', async () => {
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    await userEvent.click(screen.getByRole('button', { name: /editar grupo torres/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/razón social/i)).toHaveValue('Grupo Torres, S.A. de C.V.');
    // Edit mode: `kind` is read-only text, so there is no radio to find (FR-010).
    expect(within(dialog).queryByRole('radio')).toBeNull();
  });
});

describe('the withdraw and restore controls', () => {
  /*
   * T042. Both are `client.deactivate` (006/spec.md row 28) — FR-004a made whoever may
   * withdraw a client the same set that may restore one, so there is one gate, not two.
   *
   * PL is the interesting archetype here and has its own case: it holds create and update
   * and NOT deactivate. That split is 006's Q1, resolved 2026-08-27, and it is the one
   * place in this screen where the three client capabilities do not travel together.
   */
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith({ items: [GRUPO_TORRES, JUAN_PEREZ], nextCursor: null }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers "Retirar" on an active client to an archetype holding client.deactivate', async () => {
    renderWithClient(<ClientDirectory archetype="BM" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    expect(screen.getByRole('button', { name: /retirar grupo torres/i })).toBeInTheDocument();
  });

  it('offers "Restaurar" on a withdrawn client instead', async () => {
    // One control per row, pointing the direction the record can actually go. Two controls
    // with one always disabled would be a permanent question about which one applies.
    renderWithClient(<ClientDirectory archetype="BM" />);
    await screen.findByText('Juan Perez');

    expect(screen.getByRole('button', { name: /restaurar juan perez/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirar juan perez/i })).toBeNull();
  });

  it('withholds both from PL, which holds create and update but not deactivate', async () => {
    // 006's Q1. A lawyer registers and corrects parties; taking one out of circulation is
    // a managing-partner or billing decision.
    renderWithClient(<ClientDirectory archetype="PL" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    expect(screen.getByRole('button', { name: /nuevo cliente/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /editar grupo torres/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /restaurar/i })).toBeNull();
  });

  it('withholds both from an archetype that only reads', async () => {
    renderWithClient(<ClientDirectory archetype="AA" />);
    const card = await screen.findByRole('article', { name: /Grupo Torres/ });

    expect(within(card).queryByRole('button', { name: /retirar|restaurar/i })).toBeNull();
    // No actions at all for AA, so the card has no action row.
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
  });

  it('asks for confirmation before withdrawing, and sends nothing until then', async () => {
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');
    const before = fetchMock.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: /retirar grupo torres/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent ?? '').toMatch(/asuntos existentes no se ven afectados/i);
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
