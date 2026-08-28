/**
 * T041, T042 — 019/US3, quickstart Scenario 3. Recording a new matter.
 *
 * **T041 — the four properties the contract fixes.** Nothing shown before the person has
 * done anything; every problem together rather than one per attempt; **no request** for a
 * form already known invalid; and only *active* catalog entries offered, because a retired
 * entry still resolves on an existing matter and must not be chosen for a new one.
 *
 * **T042 — the three refusals, and where each lands.** These are the only screen-level
 * interpretations in the slice, and all three are placement and refresh rather than security
 * copy. The one worth reading twice is `client_not_available`: `006` returns it for
 * *inactive*, *foreign* and *absent* alike, deliberately, and the screen must not elaborate.
 * Saying "ese cliente pertenece a otro despacho" would answer a question the caller is not
 * entitled to ask.
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

import { CaseFormDialog } from '@/app/expedientes/CaseFormDialog';

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

const CLIENTS = {
  items: [
    { id: 'cl-1', kind: 'organization', legalName: 'Grupo Torres, S.A. de C.V.', rfc: null, status: 'active' },
  ],
  nextCursor: null,
};

const CATALOGS: Record<string, unknown> = {
  'case-statuses': {
    items: [
      { id: 'st-open', name: 'En Proceso', status: 'active', isClosing: false },
      // Retired: present in the catalog, and it must NOT be offered for a new matter.
      { id: 'st-old', name: 'Archivado', status: 'retired', isClosing: true },
    ],
  },
  'matter-types': {
    items: [
      { id: 'mt-1', name: 'Mercantil', status: 'active' },
      { id: 'mt-old', name: 'Obsoleto', status: 'retired' },
    ],
  },
  venues: { items: [{ id: 'v-1', name: 'Juzgado 4° Civil CDMX', status: 'active' }] },
};

/** Routes clients, catalogs and the create call. `createResult` decides what POST answers. */
function router(createResult: { body: unknown; status: number }) {
  return (input: string, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') return respondWith(createResult.body, createResult.status)();
    if (url.includes('case-catalogs/')) {
      const key = Object.keys(CATALOGS).find((k) => url.includes(k))!;
      return respondWith(CATALOGS[key])();
    }
    if (url.includes('/tenant/clients')) return respondWith(CLIENTS)();
    return respondWith({ items: [], nextCursor: null })();
  };
}

const CREATED = {
  body: {
    id: 'new',
    fileNumber: 'EXP-2026-0099',
    client: { id: 'cl-1', legalName: 'Grupo Torres, S.A. de C.V.' },
    status: { id: 'st-open', name: 'En Proceso' },
    matterType: null,
    venue: null,
    venueCaseReference: null,
    openedOn: '2026-03-04',
    closedOn: null,
  },
  status: 201,
};

function postCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    .length;
}

function lastPostBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const posts = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
  expect(posts.length, 'no create request was sent').toBeGreaterThan(0);
  return JSON.parse((posts[posts.length - 1]![1] as RequestInit).body as string) as Record<string, unknown>;
}

/** Fills the three required fields. */
async function fillRequired(): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: /cliente/i }));
  await userEvent.click(await screen.findByRole('option', { name: /Grupo Torres/ }));

  await userEvent.type(screen.getByLabelText(/número de expediente/i), 'EXP-2026-0099');

  await userEvent.click(screen.getByRole('combobox', { name: /estado inicial/i }));
  await userEvent.click(await screen.findByRole('option', { name: 'En Proceso' }));
}

const submit = () => userEvent.click(screen.getByRole('button', { name: /guardar/i }));

describe('recording a new matter', () => {
  const fetchMock = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(router(CREATED));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows no errors before the person has done anything', async () => {
    // FR-037's other half. A form that greets someone with three red messages is telling
    // them they got something wrong before they did anything at all.
    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={onSaved} />);

    await screen.findByRole('dialog');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows every problem at once when an empty form is submitted', async () => {
    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await submit();

    /*
     * Scoped to `role="alert"`. "Selecciona el cliente" is also the picker's own placeholder,
     * so an unscoped text query matches two elements — and the one that matters is the
     * announced error, not the prompt that was there all along.
     */
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(3));
    const errors = screen.getAllByRole('alert').map((el) => el.textContent ?? '');
    expect(errors.some((t) => /Selecciona el cliente/i.test(t))).toBe(true);
    expect(errors.some((t) => /Ingresa el número de expediente/i.test(t))).toBe(true);
    expect(errors.some((t) => /Selecciona el estado inicial/i.test(t))).toBe(true);
  });

  it('sends nothing when the browser already knows the form is invalid', async () => {
    // Not an optimisation: an invalid submit comes back as a generic refusal, which says
    // strictly less than the message already on screen, and costs a round trip to say it.
    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await submit();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));

    expect(postCount(fetchMock)).toBe(0);
  });

  it('offers only active catalog entries', async () => {
    // FR-035. A retired entry still resolves on an existing matter (006/FR-020) and must
    // not be choosable for a new one.
    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('combobox', { name: /estado inicial/i }));
    expect(await screen.findByRole('option', { name: 'En Proceso' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Archivado' })).toBeNull();
  });

  it('has no field for a closing date', async () => {
    // FR-039. Derived by the server; `006` refuses a request naming it.
    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    expect(screen.queryByLabelText(/fecha de cierre/i)).toBeNull();
  });

  it('posts the matter once it is valid, and reports success upward', async () => {
    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await fillRequired();
    await submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const body = lastPostBody(fetchMock);
    expect(body).toMatchObject({
      clientId: 'cl-1',
      fileNumber: 'EXP-2026-0099',
      caseStatusId: 'st-open',
    });
  });

  it('omits every optional the person left alone', async () => {
    // data-model.md's boundary rule. `006` reads a missing `openedOn` as today; an empty
    // string is a malformed date and earns a 400 for a field nobody touched.
    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await fillRequired();
    await submit();

    await waitFor(() => expect(postCount(fetchMock)).toBe(1));
    const body = lastPostBody(fetchMock);
    expect(body).not.toHaveProperty('matterTypeId');
    expect(body).not.toHaveProperty('venueId');
    expect(body).not.toHaveProperty('venueCaseReference');
    expect(body).not.toHaveProperty('openedOn');
    expect(body).not.toHaveProperty('closedOn');
  });

  it('associates each error with its input rather than merely placing it nearby', async () => {
    // Red text beside a field is not an error a screen-reader user receives.
    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await submit();
    await screen.findByText(/Ingresa el número de expediente/i);

    const field = screen.getByLabelText(/número de expediente/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');

    const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids.length, 'the error is not associated with its input').toBeGreaterThan(0);
    const message = ids.map((id) => document.getElementById(id)).find(Boolean);
    expect(message?.textContent ?? '').toMatch(/Ingresa el número de expediente/i);
    expect(message).toHaveAttribute('role', 'alert');
  });
});

describe('a server refusal lands where the reader can act on it', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('puts a duplicate file number against the file-number field', async () => {
    fetchMock.mockImplementation(
      router({ body: { error: { code: 'file_number_already_used', message: 'x' } }, status: 409 }),
    );

    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    await fillRequired();
    await submit();

    const field = await screen.findByLabelText(/número de expediente/i);
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));

    const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    const message = ids.map((id) => document.getElementById(id)).find(Boolean);
    expect(message?.textContent ?? '').toMatch(/ya (está|esta) en uso|ya existe/i);
  });

  it('keeps what was typed when the server refuses', async () => {
    // FR-038. This is the normal way facts the browser cannot know arrive; clearing the form
    // means retyping it to learn something the server already decided.
    fetchMock.mockImplementation(
      router({ body: { error: { code: 'file_number_already_used', message: 'x' } }, status: 409 }),
    );

    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    await fillRequired();
    await submit();

    await waitFor(() =>
      expect(screen.getByLabelText(/número de expediente/i)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByLabelText(/número de expediente/i)).toHaveValue('EXP-2026-0099');
    // And the dialog is still open.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('puts an unavailable client against the client field', async () => {
    fetchMock.mockImplementation(
      router({ body: { error: { code: 'client_not_available', message: 'x' } }, status: 422 }),
    );

    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    await fillRequired();
    await submit();

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText(/cliente.*no est[áa] disponible|no se puede usar/i)).toBeInTheDocument();
    });
  });

  it('says one thing for the three causes of an unavailable client', async () => {
    /*
     * `006` returns `client_not_available` for inactive, foreign and absent alike, and says
     * so deliberately: a caller must not be able to tell them apart. "Ese cliente pertenece a
     * otro despacho" would answer a question they are not entitled to ask.
     */
    fetchMock.mockImplementation(
      router({ body: { error: { code: 'client_not_available', message: 'x' } }, status: 422 }),
    );

    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    await fillRequired();
    await submit();

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeNull());

    const text = (dialog.textContent ?? '').toLowerCase();
    for (const leak of ['otro despacho', 'otra firma', 'no existe', 'retirado', 'inactiv']) {
      expect(text, `the refusal says which of the three causes applied: "${leak}"`).not.toContain(leak);
    }
  });

  it('takes the classifier copy for a permission refusal rather than inventing its own', async () => {
    fetchMock.mockImplementation(
      router({ body: { error: { code: 'not_authorized', message: 'nope' } }, status: 403 }),
    );

    renderWithClient(<CaseFormDialog open onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    await fillRequired();
    await submit();

    const error = await screen.findByTestId('error-state');
    expect(error.textContent ?? '').toMatch(/rol actual no permite/i);
    expect(error.textContent ?? '').not.toContain('nope');
  });
});
