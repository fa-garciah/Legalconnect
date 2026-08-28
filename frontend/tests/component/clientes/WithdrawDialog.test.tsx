/**
 * T038, T039 — 018/US3. Withdrawing a client, and undoing it.
 *
 * **The asymmetry is the design, not an oversight.** Withdrawal asks for confirmation
 * before anything is sent (FR-012); restore does not. Restore *is* the undo — `006/FR-004a`
 * exists so that a mis-click costs one click to reverse — and confirming an undo is asking
 * someone to reaffirm the thing they only did to correct themselves.
 *
 * **The second sentence of the confirmation has its own test row**, and that is deliberate.
 * "Withdraw a client" sounds destructive. It is not: `006/FR-008` guarantees every existing
 * matter keeps resolving the client, and only *new* matters are barred. A confirmation that
 * said the first half and not the second would make people hesitate over a reversible
 * action — a copy defect that no assertion about behaviour would ever catch.
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

import { WithdrawDialog } from '@/app/clientes/WithdrawDialog';
import type { Client } from '@/clients/types';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

/** A factory: a `Response` body can be read only once, and these mocks are called repeatedly. */
function respondWith(body: unknown, status = 200): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );
}

const ACTIVE: Client = {
  id: 'c1',
  kind: 'organization',
  legalName: 'Grupo Torres, S.A. de C.V.',
  rfc: 'GTO120315AB1',
  status: 'active',
};

const WITHDRAWN: Client = { ...ACTIVE, id: 'c2', legalName: 'Juan Perez', status: 'inactive' };

describe('withdrawing asks first', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith({ id: 'c1', status: 'inactive', deactivatedAt: 'now' }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends nothing until the action is confirmed', async () => {
    // FR-012. The dialog being open is not consent; opening it is how someone finds out
    // what withdrawal would do.
    renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={vi.fn()} onDone={vi.fn()} />,
    );

    await screen.findByRole('alertdialog');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('names the client it is about to withdraw', async () => {
    // A confirmation that does not say which record it means is a confirmation of nothing
    // in particular — and the control that opened it was one of many identical rows.
    renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={vi.fn()} onDone={vi.fn()} />,
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Grupo Torres/)).toBeInTheDocument();
  });

  it('says new matters are barred', async () => {
    renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={vi.fn()} onDone={vi.fn()} />,
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent ?? '').toMatch(/no podrá usarse en nuevos asuntos/i);
  });

  it('also says existing matters are untouched', async () => {
    // **The row this suite exists for.** 006/FR-008: withdrawal bars future cases and
    // changes nothing about the ones already open. Saying only the first half makes a
    // reversible, narrow action read as deletion.
    renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={vi.fn()} onDone={vi.fn()} />,
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent ?? '').toMatch(/asuntos existentes no se ven afectados/i);
  });

  it('offers a way out that sends nothing', async () => {
    const onClose = vi.fn();
    renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={onClose} onDone={vi.fn()} />,
    );
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the deactivate route once confirmed', async () => {
    const onDone = vi.fn();
    renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={vi.fn()} onDone={onDone} />,
    );
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: /retirar/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toContain('/tenant/clients/c1/deactivate');
    expect(init.method).toBe('POST');
  });

  it('refreshes the directory rather than patching it', async () => {
    const { client } = renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={vi.fn()} onDone={vi.fn()} />,
    );
    client.setQueryData(['clients', '', 'all'], { pages: [], pageParams: [] });
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: /retirar/i }));

    await waitFor(() => {
      expect(client.getQueryState(['clients', '', 'all'])?.isInvalidated).toBe(true);
    });
  });
});

describe('restoring does not', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith({ id: 'c2', status: 'active', deactivatedAt: null }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts to reactivate immediately, with no confirmation step', async () => {
    // FR-013. Restore is the undo; confirming an undo asks someone to reaffirm the action
    // they took to correct themselves.
    const onDone = vi.fn();
    renderWithClient(
      <WithdrawDialog open action="restore" client={WITHDRAWN} onClose={vi.fn()} onDone={onDone} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toContain('/tenant/clients/c2/reactivate');
    expect(init.method).toBe('POST');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('never puts a confirmation in front of the undo', async () => {
    renderWithClient(
      <WithdrawDialog open action="restore" client={WITHDRAWN} onClose={vi.fn()} onDone={vi.fn()} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /confirmar|restaurar/i })).toBeNull();
  });
});

describe('the record moved under the caller', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports a 409 on withdraw and refreshes', async () => {
    // A colleague got there first. 006 refuses the second withdrawal rather than accepting
    // it silently, so the audit trail never gains a deactivation that deactivated nothing.
    fetchMock.mockImplementation(
      respondWith({ error: { code: 'already_deactivated', message: 'x' } }, 409),
    );

    const { client } = renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={vi.fn()} onDone={vi.fn()} />,
    );
    client.setQueryData(['clients', '', 'all'], { pages: [], pageParams: [] });
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: /retirar/i }));

    await screen.findByTestId('error-state');
    await waitFor(() => {
      expect(client.getQueryState(['clients', '', 'all'])?.isInvalidated).toBe(true);
    });
  });

  it('reports a 409 already_active on restore and refreshes', async () => {
    fetchMock.mockImplementation(respondWith({ error: { code: 'already_active', message: 'x' } }, 409));

    const { client } = renderWithClient(
      <WithdrawDialog open action="restore" client={WITHDRAWN} onClose={vi.fn()} onDone={vi.fn()} />,
    );
    client.setQueryData(['clients', '', 'all'], { pages: [], pageParams: [] });

    await screen.findByTestId('error-state');
    await waitFor(() => {
      expect(client.getQueryState(['clients', '', 'all'])?.isInvalidated).toBe(true);
    });
  });

  it('takes the classifier copy for a role refusal, unchanged', async () => {
    // Reachable only if the control was shown to someone who should not hold it — which
    // would be a defect in the mirror, not in this component. It still has to render
    // 016a's copy rather than the server's message.
    fetchMock.mockImplementation(
      respondWith({ error: { code: 'not_authorized', message: 'nope' } }, 403),
    );

    renderWithClient(
      <WithdrawDialog open action="withdraw" client={ACTIVE} onClose={vi.fn()} onDone={vi.fn()} />,
    );
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: /retirar/i }));

    const error = await screen.findByTestId('error-state');
    expect(error.textContent ?? '').toMatch(/rol actual no permite/i);
    expect(error.textContent ?? '').not.toContain('nope');
  });
});
