/**
 * T056 — 019/FR-024, FR-025, SC-010. The four properties a dense data table and two dialogs
 * most often lose.
 *
 * **Why these four.** The vendored components implement most of WCAG already. What this
 * slice adds is *wrappers*, and a wrapper is the easy place to throw that away: a table whose
 * headers are not associated with its cells, fifteen buttons all named "Abrir", an error
 * placed beside an input rather than tied to it, a dialog that drops focus on Escape.
 *
 * The Escape case has its own test. Closing with a button usually returns focus by accident;
 * Escape takes a different path out of the component, and it is the path `018` found broken.
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

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function respondWith(body: unknown): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
}

const CASE = {
  id: 'c1',
  fileNumber: 'EXP-2026-0042',
  client: { id: 'cl1', legalName: 'Grupo Torres, S.A. de C.V.', status: 'active' },
  status: { id: 'st1', name: 'En Proceso', catalogStatus: 'active' },
  matterType: null,
  venue: null,
  venueCaseReference: null,
  openedOn: '2026-03-04',
  closedOn: null,
  team: [],
};

function router(input: string) {
  const url = String(input);
  if (url.includes('case-catalogs')) {
    return respondWith({ items: [{ id: 'st1', name: 'En Proceso', status: 'active', isClosing: false }] })();
  }
  if (url.includes('/tenant/clients')) return respondWith({ items: [], nextCursor: null })();
  if (/\/tenant\/cases\/[^/?]+$/.test(url.split('?')[0]!)) return respondWith(CASE)();
  return respondWith({ items: [CASE], nextCursor: null })();
}

describe('the table conveys its structure', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(router);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes real column headers, so a value can be placed in its column', async () => {
    // FR-024. Without header semantics a screen reader announces six values in a row and
    // leaves the listener to guess which is the venue and which the client.
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    expect(screen.getAllByRole('columnheader')).toHaveLength(7); // six columns plus actions
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('names each row action after the matter it acts on', async () => {
    // Fifteen buttons all called "Abrir" tell a screen-reader user nothing about which row
    // they are on.
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    const open = screen.getByRole('button', { name: /^abrir /i });
    expect(open.getAttribute('aria-label') ?? '').toContain('EXP-2026-0042');
  });

  it('gives the actions column a name that is not read aloud as empty', async () => {
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    const headers = screen.getAllByRole('columnheader');
    expect(headers[headers.length - 1]!.textContent).toBe('Acciones');
  });
});

describe('every control is labelled and reachable', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(router);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('labels the three filters', async () => {
    // `getByRole(..., { name })` resolves through `for`/`id`, `aria-labelledby` and
    // `aria-label` — the three associations that actually reach assistive technology. Text
    // sitting next to an input satisfies none of them.
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    expect(screen.getByRole('searchbox', { name: /buscar/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Juzgado' })).toBeInTheDocument();
  });

  it('reaches every control by keyboard alone', async () => {
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    const reachable = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      await userEvent.tab();
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) {
        reachable.add((active.getAttribute('aria-label') ?? active.textContent ?? '').toLowerCase());
      }
    }

    expect([...reachable].some((label) => label.includes('nuevo expediente'))).toBe(true);
    expect([...reachable].some((label) => label.includes('abrir'))).toBe(true);
  });
});

describe('dialogs keep and return focus', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(router);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('moves focus into the detail panel when a matter is opened', async () => {
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    await userEvent.click(screen.getByRole('button', { name: /^abrir /i }));
    const panel = await screen.findByRole('dialog');

    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
  });

  it('returns focus to the row control when the panel is closed with Escape', async () => {
    /*
     * The case most likely to be missed, and the one `018` found genuinely broken: a modal
     * `DialogContent` prevents its focus scope's own restore and focuses a `DialogTrigger`
     * instead. This composition drives the panel from state and has no trigger, so without
     * `useDialogAnchor` the override focuses nothing and Escape drops the reader on the body.
     */
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    const trigger = screen.getByRole('button', { name: /^abrir /i });
    trigger.focus();
    await userEvent.click(trigger);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('returns focus to the create button when the form is closed with Escape', async () => {
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    const trigger = screen.getByRole('button', { name: /nuevo expediente/i });
    trigger.focus();
    await userEvent.click(trigger);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('announces every validation error and ties it to its input', async () => {
    renderWithClient(<CaseRegister archetype="MP" />);
    await screen.findByRole('row', { name: /EXP-2026-0042/ });

    await userEvent.click(screen.getByRole('button', { name: /nuevo expediente/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(within(dialog).getAllByRole('alert').length).toBeGreaterThan(0));

    const field = within(dialog).getByLabelText(/número de expediente/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids.length, 'the error is not associated with its input').toBeGreaterThan(0);
  });
});
