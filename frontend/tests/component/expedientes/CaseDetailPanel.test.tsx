/**
 * T031, T032 — 019/US2. Opening one matter.
 *
 * **The second group is why this slice exists.** `004` declared the `assigned` scope kind,
 * `006` implemented its opacity rule — a matter you are not on answers `404`, byte-identical
 * to one that does not exist — and every test of it so far has compared response bodies.
 * This is the first time anyone checks that it reads the same to a person.
 *
 * The failure it guards against is not malice, it is helpfulness: someone adds
 * *"no tienes acceso a este expediente"* because the generic message felt unhelpful, and in
 * doing so tells a caller that a matter they cannot see **exists**. That is the whole of the
 * disclosure, and it is one well-meaning copy change away at all times.
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

import { CaseDetailPanel } from '@/app/expedientes/CaseDetailPanel';
import type { CaseDetail } from '@/cases/types';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

function respondWith(body: unknown, status = 200): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );
}

const DETAIL: CaseDetail = {
  id: 'c1',
  fileNumber: 'EXP-2026-0042',
  client: { id: 'cl1', legalName: 'Grupo Torres, S.A. de C.V.', status: 'active' },
  status: { id: 'st1', name: 'En Proceso', catalogStatus: 'active' },
  matterType: { id: 'mt1', name: 'Mercantil', catalogStatus: 'active' },
  venue: { id: 'v1', name: 'Juzgado 4° Civil CDMX' },
  venueCaseReference: '1234/2026',
  openedOn: '2026-03-04',
  closedOn: null,
  team: [
    { membershipId: 'm-1', roleOnCase: 'lead', assignedAt: '2026-03-04T00:00:00.000Z' },
    { membershipId: 'm-2', roleOnCase: 'support', assignedAt: '2026-03-05T00:00:00.000Z' },
  ],
};

const NOT_FOUND = { error: { code: 'not_found', message: 'Resource not found.' } };

/**
 * Strips the dialog's auto-generated element ids before two renderings are compared.
 *
 * Radix numbers them from a counter that keeps advancing across mounts, so the second render
 * in one test is `radix-_r_4_` where the first was `radix-_r_1_`. That is an artefact of
 * mounting twice, not a difference a reader could ever observe — and leaving it in would
 * make the comparison fail for a reason that has nothing to do with what it checks.
 *
 * Everything that *would* betray the difference survives: an echoed case id, different copy,
 * a control present in one and absent from the other.
 */
function normalise(html: string): string {
  return html.replace(/radix-[\w-]+/g, 'radix-id');
}

/** Catalog reads succeed; only the case read varies. */
function router(caseBody: unknown, caseStatus = 200) {
  return (input: string) => {
    const url = String(input);
    if (url.includes('case-catalogs')) {
      return respondWith({
        items: [{ id: 'st1', name: 'En Proceso', status: 'active', isClosing: false }],
      })();
    }
    return respondWith(caseBody, caseStatus)();
  };
}

describe('an opened matter shows its record and its team', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the fields the register could not carry', async () => {
    fetchMock.mockImplementation(router(DETAIL));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    // `findBy`, not `getBy`: the dialog is on screen the moment it opens, but its content
    // arrives with the query. A synchronous query here asserts against an empty shell.
    // `findAll`: the file number is both the panel's heading and a field in the record.
    expect((await within(panel).findAllByText('EXP-2026-0042')).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('Grupo Torres, S.A. de C.V.').length).toBeGreaterThan(0);
    // The court's own number — independent of the venue, and absent from the list item.
    expect(within(panel).getByText('1234/2026')).toBeInTheDocument();
  });

  it('renders the opening date as the day it says', async () => {
    fetchMock.mockImplementation(router(DETAIL));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('04/03/2026')).toBeInTheDocument();
  });

  it('lists the live team with each role', async () => {
    fetchMock.mockImplementation(router(DETAIL));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    const team = await within(panel).findByTestId('case-team');
    expect(within(team).getAllByRole('listitem')).toHaveLength(2);
    expect(within(team).getByText(/responsable/i)).toBeInTheDocument();
    expect(within(team).getByText(/apoyo/i)).toBeInTheDocument();
  });

  it('says sin asignar for an empty team rather than showing a blank', async () => {
    // A freshly created matter has nobody on it (`006` Decision 3). Legitimate and
    // transient — not an error, and not an empty region the reader has to interpret.
    fetchMock.mockImplementation(router({ ...DETAIL, team: [] }));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText(/sin asignar/i)).toBeInTheDocument();
  });

  it('keeps a retired catalog entry visible and marks it retired', async () => {
    // 006/FR-020. The entry still resolves on a matter that references it; it simply may not
    // be chosen for a new one.
    fetchMock.mockImplementation(
      router({ ...DETAIL, matterType: { id: 'mt1', name: 'Mercantil', catalogStatus: 'retired' } }),
    );

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('Mercantil')).toBeInTheDocument();
    expect(within(panel).getByText(/retirado/i)).toBeInTheDocument();
  });

  it('never shows the wire vocabulary for a role', async () => {
    // `lead` and `support` are the wire's words. A Mexican firm reads *responsable* and
    // *apoyo*.
    fetchMock.mockImplementation(router(DETAIL));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    await within(panel).findByTestId('case-team');
    expect(panel.textContent ?? '').not.toMatch(/\blead\b|\bsupport\b/);
  });
});

describe('a matter you are not on is a matter that does not exist', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders identically for a fabricated id and for a real unassigned one', async () => {
    /*
     * Both are `404` from `006` — the server has already made them indistinguishable. What
     * this asserts is that the *screen* does not undo that: no echoed id, no branch on which
     * request it was, nothing that differs between the two renderings.
     */
    fetchMock.mockImplementation(router(NOT_FOUND, 404));

    const fabricated = renderWithClient(
      <CaseDetailPanel open caseId="00000000-0000-4000-8000-0000000000ff" archetype="AA" onClose={vi.fn()} />,
    );
    await screen.findByTestId('error-state');
    const fabricatedHtml = normalise((await screen.findByRole('dialog')).innerHTML);
    fabricated.unmount();

    renderWithClient(
      <CaseDetailPanel open caseId="af600d7e-9121-4f74-b3e3-da13b83b7a8e" archetype="AA" onClose={vi.fn()} />,
    );
    await screen.findByTestId('error-state');
    const realButUnassignedHtml = normalise((await screen.findByRole('dialog')).innerHTML);

    expect(realButUnassignedHtml).toBe(fabricatedHtml);
  });

  it('says nothing about assignment, permission or access', async () => {
    /*
     * **The assertion that matters.** The failure is not malice, it is helpfulness: someone
     * finds the generic message unhelpful and writes "no tienes acceso a este expediente",
     * and in doing so tells a caller that a matter they cannot see EXISTS. That single
     * sentence is the whole disclosure the `assigned` scope was built to prevent.
     */
    fetchMock.mockImplementation(router(NOT_FOUND, 404));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="AA" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    await within(panel).findByTestId('error-state');

    const text = (panel.textContent ?? '').toLowerCase();
    for (const leak of ['asignad', 'permiso', 'acceso', 'autoriz', 'no formas parte', 'equipo del caso']) {
      expect(text, `the refusal hints at why: "${leak}"`).not.toContain(leak);
    }
  });

  it('renders the refusal through 016a classifier, not its own copy', async () => {
    fetchMock.mockImplementation(router(NOT_FOUND, 404));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="AA" onClose={vi.fn()} />);

    const error = await screen.findByTestId('error-state');
    // The opaque bucket's wording, which `not_found` maps to. Never the server's message.
    expect(error.textContent ?? '').toMatch(/no se pudo completar esta acción/i);
    expect(error.textContent ?? '').not.toContain('Resource not found');
  });
});

describe('one deliberate open is one read', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const caseReads = (): number =>
    fetchMock.mock.calls.filter((c) => {
      const url = String(c[0]);
      return /\/tenant\/cases\/[^/?]+$/.test(url.split('?')[0]!);
    }).length;

  it('reads the case exactly once when opened', async () => {
    fetchMock.mockImplementation(router(DETAIL));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);
    await screen.findAllByText('EXP-2026-0042');

    expect(caseReads()).toBe(1);
  });

  it('does not read again when the window regains focus', async () => {
    /*
     * research D3. `GET /tenant/cases/:id` writes an audit entry per interactive call, and
     * this application's query client refetches on window focus by default. A reader who
     * alt-tabs away and back would silently write a second access entry for a matter they
     * opened once — and an access log that counts window focus is one nobody can reason
     * about.
     */
    fetchMock.mockImplementation(router(DETAIL));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);
    await screen.findAllByText('EXP-2026-0042');

    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(caseReads()).toBe(1));
  });
});

describe('moving a matter forward', () => {
  /*
   * T049, T050 — 019/US4.
   *
   * **The closing date is the interesting part.** Nobody types it. Moving to a status the
   * firm declared as ending a matter stamps today; moving away clears it. `006` refuses a
   * request that carries the field at all, so an implementation that spread the loaded record
   * into the payload would fail on every save — including ones that changed only the status.
   */
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  /** Catalogs with one open status, one closing status and one retired. */
  const STATUS_CATALOG = {
    items: [
      { id: 'st1', name: 'En Proceso', status: 'active', isClosing: false },
      { id: 'st2', name: 'Concluido', status: 'active', isClosing: true },
      { id: 'st-old', name: 'Archivado', status: 'retired', isClosing: true },
    ],
  };

  function statusRouter(patchResult: { body: unknown; status: number }) {
    return (input: string, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PATCH') return respondWith(patchResult.body, patchResult.status)();
      if (url.includes('case-catalogs')) return respondWith(STATUS_CATALOG)();
      return respondWith(DETAIL)();
    };
  }

  const lastPatch = (): { url: string; body: Record<string, unknown> } => {
    const calls = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(calls.length, 'no status change was sent').toBeGreaterThan(0);
    const [url, init] = calls[calls.length - 1] as [string, RequestInit];
    return { url: String(url), body: JSON.parse(init.body as string) as Record<string, unknown> };
  };

  async function openAndChangeStatus(to: string): Promise<void> {
    await screen.findByTestId('case-team');
    await userEvent.click(screen.getByRole('combobox', { name: /cambiar estado/i }));
    await userEvent.click(await screen.findByRole('option', { name: to }));
  }

  it('offers the status control to an archetype that holds it', async () => {
    fetchMock.mockImplementation(statusRouter({ body: {}, status: 200 }));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);
    await screen.findByTestId('case-team');

    expect(screen.getByRole('combobox', { name: /cambiar estado/i })).toBeInTheDocument();
  });

  it('withholds it from a PL, who reads matters and moves none of them', async () => {
    // 006/spec.md row 32. `PL` holds `case.read` and not `case.change_status`.
    fetchMock.mockImplementation(statusRouter({ body: {}, status: 200 }));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="PL" onClose={vi.fn()} />);
    await screen.findByTestId('case-team');

    expect(screen.queryByRole('combobox', { name: /cambiar estado/i })).toBeNull();
  });

  it('offers active statuses only', async () => {
    fetchMock.mockImplementation(statusRouter({ body: {}, status: 200 }));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);
    await screen.findByTestId('case-team');

    await userEvent.click(screen.getByRole('combobox', { name: /cambiar estado/i }));
    expect(await screen.findByRole('option', { name: 'Concluido' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Archivado' })).toBeNull();
  });

  it('sends the status and nothing else', async () => {
    /*
     * **The assertion this group exists for.** `006` refuses a request naming `closedOn` —
     * it does not ignore it — so the natural implementation, spreading the loaded record
     * into the payload, earns a 400 on every save.
     */
    fetchMock.mockImplementation(
      statusRouter({ body: { id: 'c1', status: { id: 'st2', name: 'Concluido' }, closedOn: '2026-08-28' }, status: 200 }),
    );

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);
    await openAndChangeStatus('Concluido');

    await waitFor(() => {
      const { url, body } = lastPatch();
      expect(url).toContain('/tenant/cases/c1/status');
      expect(Object.keys(body)).toEqual(['caseStatusId']);
      expect(body.caseStatusId).toBe('st2');
    });
  });

  it('never offers a field for the closing date', async () => {
    fetchMock.mockImplementation(statusRouter({ body: {}, status: 200 }));

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);
    const panel = await screen.findByRole('dialog');
    await within(panel).findByTestId('case-team');

    // It is *shown* as a read-only field, and never as something to fill in.
    expect(within(panel).queryByRole('textbox', { name: /fecha de cierre/i })).toBeNull();
    expect(within(panel).queryByLabelText(/cambiar fecha de cierre/i)).toBeNull();
  });

  it('tells the reader plainly when the matter already holds that status', async () => {
    // `006` refuses rather than silently accepting, so the audit log never gains a no-op.
    fetchMock.mockImplementation(
      statusRouter({ body: { error: { code: 'same_status', message: 'x' } }, status: 422 }),
    );

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="MP" onClose={vi.fn()} />);
    await openAndChangeStatus('Concluido');

    const panel = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(panel).getByText(/ya tiene ese estado/i)).toBeInTheDocument();
    });
  });

  it('renders a 404 opaquely, because it may mean not-assigned', async () => {
    /*
     * The `assigned` scope again, on the write side. A member removed from the case team
     * between opening it and changing its status gets `404` — the same answer as a matter
     * that never existed — and the screen must not improve on it.
     */
    fetchMock.mockImplementation(
      statusRouter({ body: { error: { code: 'not_found', message: 'x' } }, status: 404 }),
    );

    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="AA" onClose={vi.fn()} />);
    await openAndChangeStatus('Concluido');

    const panel = await screen.findByRole('dialog');
    await waitFor(() => expect(within(panel).getByTestId('error-state')).toBeInTheDocument());

    const text = (panel.textContent ?? '').toLowerCase();
    for (const leak of ['asignad', 'permiso', 'acceso', 'equipo del caso']) {
      expect(text, `the refusal hints at why: "${leak}"`).not.toContain(leak);
    }
  });
});
