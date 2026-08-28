/**
 * T030, T031 — 018/US2, quickstart Scenario 3. The client form.
 *
 * **T030 — the four properties contracts/client-screens.md §2.3 fixes.** Nothing is shown
 * before the person has done anything (FR-007); every problem appears together rather than
 * one per attempt (SC-002); a form the browser already knows is invalid sends no request at
 * all (SC-003); and a server refusal renders against the form with what was typed still
 * there (FR-009). The last one is the normal arrival path for facts the browser cannot
 * know — a client withdrawn by a colleague, a capability the caller does not hold — so
 * losing the typed values there means retyping the form to learn something the server
 * already decided.
 *
 * **T031 — `kind` immutability, and it gets its own group.** `006` refuses a `PATCH` naming
 * `kind` with a `400`; it does not ignore it. The natural implementation of an edit form
 * spreads the loaded client into the payload, sends `kind` unchanged, and earns a refusal
 * on *every* save — including saves that changed nothing about the kind. That is a defect
 * that reads as correct code, which is exactly the kind that needs a named assertion rather
 * than incidental coverage.
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

import { ClientFormDialog } from '@/app/clientes/ClientFormDialog';
import type { Client } from '@/clients/types';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

/** A factory: a `Response` body can be read only once, and these mocks are called repeatedly. */
function respondWith(body: unknown, status = 200): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );
}

const EXISTING: Client = {
  id: 'c1',
  kind: 'organization',
  legalName: 'Grupo Torres, S.A. de C.V.',
  rfc: 'GTO120315AB1',
  status: 'active',
};

/** The JSON body of the last request, so payload shape can be asserted on. */
function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const calls = fetchMock.mock.calls;
  expect(calls.length, 'no request was sent').toBeGreaterThan(0);
  const [, init] = calls[calls.length - 1] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function nameField(): HTMLElement {
  return screen.getByLabelText(/razón social/i);
}

function submit(): Promise<void> {
  return userEvent.click(screen.getByRole('button', { name: /guardar/i }));
}

describe('creating a client', () => {
  const fetchMock = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith({ ...EXISTING, id: 'new' }, 201));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows no errors before the person has done anything', async () => {
    // FR-007. A form that greets someone with three red messages is telling them they did
    // something wrong before they did anything at all.
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);

    await screen.findByRole('dialog');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Ingresa la razón social/i)).toBeNull();
  });

  it('shows every problem at once when an empty form is submitted', async () => {
    // SC-002. One-per-attempt turns a three-field form into three round trips of
    // discovery, and the person cannot see how much work is left.
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await submit();

    expect(await screen.findByText(/Ingresa la razón social/i)).toBeInTheDocument();
    expect(screen.getByText(/Selecciona el tipo de cliente/i)).toBeInTheDocument();
  });

  it('sends nothing when the browser already knows the form is invalid', async () => {
    // SC-003. Not an optimisation: an invalid submit that reaches the server comes back as
    // a generic refusal, which is strictly less useful than the message already available
    // here, and it costs a round trip to say less.
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await submit();
    await screen.findByText(/Ingresa la razón social/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('associates each error with its input rather than merely placing it nearby', async () => {
    // FR-026. Red text beside a field is not an error a screen-reader user receives.
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await submit();
    await screen.findByText(/Ingresa la razón social/i);

    const field = nameField();
    expect(field).toHaveAttribute('aria-invalid', 'true');

    const describedBy = field.getAttribute('aria-describedby') ?? '';
    const described = describedBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(described).toMatch(/Ingresa la razón social/i);
  });

  it('posts the form once it is valid, and reports success upward', async () => {
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('dialog');

    await userEvent.type(nameField(), 'Juan Perez');
    await userEvent.click(screen.getByRole('radio', { name: /persona/i }));
    await submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toContain('/tenant/clients');
    expect(init.method).toBe('POST');
    expect(lastBody(fetchMock)).toMatchObject({ kind: 'person', legalName: 'Juan Perez', rfc: null });
  });
});

describe('a server refusal lands on the form, with the typing intact', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps what was typed when the server refuses', async () => {
    // FR-009. This is the normal way facts the browser cannot know arrive. Clearing the
    // form here means retyping it to learn something the server has already decided.
    fetchMock.mockImplementation(
      respondWith({ error: { code: 'permission_denied', message: 'no' } }, 403),
    );

    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');

    await userEvent.type(nameField(), 'Juan Perez');
    await userEvent.click(screen.getByRole('radio', { name: /persona/i }));
    await submit();

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByTestId('error-state');
    // Still there. The dialog did not close and the field was not reset.
    expect(nameField()).toHaveValue('Juan Perez');
  });

  it('takes the classifier copy unchanged rather than inventing its own', async () => {
    // research D6: `refusal-bucket.ts` is 016a's and is not modified by this slice. A
    // screen that wrote its own copy per status code would be a second security-copy
    // source, drifting from 004's non-disclosure rules with nothing to catch it.
    fetchMock.mockImplementation(
      respondWith({ error: { code: 'permission_denied', message: 'no' } }, 403),
    );

    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');
    await userEvent.type(nameField(), 'Juan Perez');
    await userEvent.click(screen.getByRole('radio', { name: /persona/i }));
    await submit();

    const error = await screen.findByTestId('error-state');
    // Never the server's own message, and never the code.
    expect(error.textContent ?? '').not.toContain('permission_denied');
    expect(error.textContent ?? '').not.toContain('no');
  });

  it('refreshes the record when the client turned out to be withdrawn', async () => {
    // contracts/client-screens.md §2.4, the one screen-level interpretation in this slice
    // — and it is placement and refresh, not security copy. A colleague withdrew the
    // client between load and save; showing the refusal without re-reading would leave the
    // form claiming a status that is no longer true.
    fetchMock.mockImplementation(
      respondWith({ error: { code: 'already_deactivated', message: 'x' } }, 409),
    );

    const { client } = renderWithClient(
      <ClientFormDialog open mode="edit" client={EXISTING} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    // Stand in for the directory the dialog always opens over — the thing that holds this
    // query in a real screen.
    client.setQueryData(['clients', '', 'all'], { pages: [], pageParams: [] });

    await screen.findByRole('dialog');

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Grupo Torres Actualizado');
    await submit();

    await screen.findByTestId('error-state');

    /*
     * The observable here is invalidation, not a second `fetch`. Mounted alone, the dialog
     * is the only subscriber and there is no active observer of the client list, so an
     * invalidated query is marked stale and refetches when something is watching it — which
     * on the real screen is the directory underneath. Asserting a second request would be
     * asserting an artefact of how this test mounts things.
     */
    await waitFor(() => {
      expect(client.getQueryState(['clients', '', 'all'])?.isInvalidated).toBe(true);
    });
  });
});

describe('kind is fixed at creation', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith(EXISTING));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('is choosable when creating', async () => {
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');

    expect(screen.getByRole('radio', { name: /persona/i })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /organizaci/i })).toBeEnabled();
  });

  it('renders as read-only text when editing, not as a disabled control', async () => {
    // FR-010. A disabled control still looks like a control — it says "not right now",
    // which invites someone to look for the condition that would enable it. Text says
    // "this is a property of the record", which is the truth: an organization does not
    // become a person.
    renderWithClient(
      <ClientFormDialog open mode="edit" client={EXISTING} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect(within(dialog).queryByRole('combobox', { name: /tipo/i })).toBeNull();
    expect(within(dialog).getByText(/Organizaci/i)).toBeInTheDocument();
  });

  it('omits kind from the edit payload entirely', async () => {
    // **The assertion this group exists for.** Not "sends it unchanged" — omits it. 006
    // returns 400 for a PATCH that names `kind`, so the spread-the-record implementation
    // fails every save, including ones that touched only the name.
    renderWithClient(
      <ClientFormDialog open mode="edit" client={EXISTING} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    await screen.findByRole('dialog');

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Grupo Torres Actualizado');
    await submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toContain('/tenant/clients/c1');
    expect(init.method).toBe('PATCH');

    const body = lastBody(fetchMock);
    expect(body).not.toHaveProperty('kind');
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('status');
    expect(body).toMatchObject({ legalName: 'Grupo Torres Actualizado' });
  });

  it('opens an edit form already holding the record values', async () => {
    renderWithClient(
      <ClientFormDialog open mode="edit" client={EXISTING} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    await screen.findByRole('dialog');

    expect(nameField()).toHaveValue('Grupo Torres, S.A. de C.V.');
    expect(screen.getByLabelText(/RFC/i)).toHaveValue('GTO120315AB1');
  });

  it('shows an empty string, not "null", for a record with no RFC', async () => {
    // Wire → form: `rfc ?? ''`. Rendering `null` into a controlled input makes React
    // switch the field between controlled and uncontrolled, and prints "null" in the box.
    renderWithClient(
      <ClientFormDialog
        open
        mode="edit"
        client={{ ...EXISTING, rfc: null }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    await screen.findByRole('dialog');

    expect(screen.getByLabelText(/RFC/i)).toHaveValue('');
  });
});
