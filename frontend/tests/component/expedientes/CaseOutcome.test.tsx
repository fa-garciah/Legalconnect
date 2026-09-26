/**
 * T005b — 015/FR-002c. The control that makes the success rate possible.
 *
 * THIS TEST EXISTS BECAUSE THE SLICE NEARLY SHIPPED WITHOUT IT. `/speckit-analyze` flagged it
 * as HIGH: the endpoint was built, the aggregate read it, the dashboard drew it — and no screen
 * anywhere let a firm declare an outcome, so every rate would have read "Datos insuficientes"
 * forever and the story would have been dead code that passed its own tests.
 *
 * THE CONTROL APPEARS EXACTLY WHEN THE DATABASE WILL ACCEPT A DECLARATION — that is, when the
 * matter is closed (`case_file_outcome_requires_closed`). Offering it on an open matter would
 * produce a `400` for a choice the screen invited, which is a worse failure than not offering it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { CaseDetailPanel } from '@/app/expedientes/CaseDetailPanel';
import type { Archetype } from '@/session/types';
import type { CaseDetail } from '@/cases/types';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

const OPEN: CaseDetail = {
  id: 'c1',
  fileNumber: 'EXP-2026-0042',
  client: { id: 'cl1', legalName: 'Grupo Torres, S.A. de C.V.', status: 'active' },
  status: { id: 'st1', name: 'En Proceso', catalogStatus: 'active' },
  matterType: { id: 'mt1', name: 'Mercantil', catalogStatus: 'active' },
  venue: { id: 'v1', name: 'Juzgado 4° Civil CDMX' },
  venueCaseReference: '1234/2026',
  openedOn: '2026-03-04',
  closedOn: null,
  outcome: null,
  team: [],
};

const CLOSED_UNDECLARED: CaseDetail = {
  ...OPEN,
  status: { id: 'st9', name: 'Concluido', catalogStatus: 'active' },
  closedOn: '2026-08-19',
};

const CLOSED_DECLARED: CaseDetail = { ...CLOSED_UNDECLARED, outcome: 'convenio' };

const STATUSES = {
  items: [
    { id: 'st1', name: 'En Proceso', isClosing: false, status: 'active' },
    { id: 'st9', name: 'Concluido', isClosing: true, status: 'active' },
  ],
};

describe('declaring how a matter ended', () => {
  const fetchMock = vi.fn();

  function serve(detail: CaseDetail, overrides: Record<string, () => Response> = {}) {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url).replace(/^\/api\/lc/, '').split('?')[0]!;
      const key = `${(init?.method ?? 'GET').toUpperCase()} ${path}`;
      const override = overrides[key];
      if (override) return Promise.resolve(override());
      const body =
        path === '/tenant/case-catalogs/case-statuses' ? STATUSES : detail;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
  }

  function mount(detail: CaseDetail, archetype: Archetype = 'MP') {
    return renderWithClient(
      <CaseDetailPanel open caseId="c1" archetype={archetype} onClose={() => {}} />,
    );
  }

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers no outcome control on an open matter', async () => {
    // The database refuses one (`case_file_outcome_requires_closed`), so inviting the choice
    // here would be inviting a 400.
    serve(OPEN);
    mount(OPEN);
    await screen.findAllByText('Grupo Torres, S.A. de C.V.');
    expect(screen.queryByLabelText('Declarar resultado')).not.toBeInTheDocument();
  });

  it('prompts for an outcome once the matter is closed and none is declared', async () => {
    serve(CLOSED_UNDECLARED);
    mount(CLOSED_UNDECLARED);
    expect(await screen.findByLabelText('Declarar resultado')).toBeInTheDocument();
    expect(screen.getByTestId('outcome-prompt')).toHaveTextContent(
      'Declara cómo terminó este asunto para que cuente en los indicadores del despacho.',
    );
  });

  it('shows the declared outcome and no longer prompts', async () => {
    serve(CLOSED_DECLARED);
    mount(CLOSED_DECLARED);
    expect(await screen.findByLabelText('Declarar resultado')).toHaveTextContent('Convenio');
    expect(screen.queryByTestId('outcome-prompt')).not.toBeInTheDocument();
  });

  it('offers the four outcomes in Spanish and nothing else', async () => {
    const user = userEvent.setup();
    serve(CLOSED_UNDECLARED);
    mount(CLOSED_UNDECLARED);

    await user.click(await screen.findByLabelText('Declarar resultado'));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Favorable', 'Desfavorable', 'Convenio', 'Sin resolución']);
  });

  it('sends the chosen outcome and nothing else', async () => {
    const user = userEvent.setup();
    const patched = vi.fn();
    serve(CLOSED_UNDECLARED, {
      'PATCH /tenant/cases/c1/outcome': () => {
        patched();
        return new Response(JSON.stringify({ ...CLOSED_DECLARED, outcome: 'favorable' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    mount(CLOSED_UNDECLARED);

    await user.click(await screen.findByLabelText('Declarar resultado'));
    await user.click(await screen.findByRole('option', { name: 'Favorable' }));

    await waitFor(() => expect(patched).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    )!;
    // `closedOn` is the server's to stamp, and `006` refuses a request that names it — a payload
    // assembled by spreading the loaded record would 400 on every save.
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ outcome: 'favorable' });
  });

  it('lets a firm correct a declaration it already made', async () => {
    const user = userEvent.setup();
    serve(CLOSED_DECLARED, {
      'PATCH /tenant/cases/c1/outcome': () =>
        new Response(JSON.stringify({ ...CLOSED_DECLARED, outcome: 'desfavorable' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    mount(CLOSED_DECLARED);

    await user.click(await screen.findByLabelText('Declarar resultado'));
    await user.click(await screen.findByRole('option', { name: 'Desfavorable' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patch).toBeDefined();
    });
  });

  it('shows no control to an archetype that cannot change a status', async () => {
    // Decision 3 — the outcome reuses `case.change_status` rather than inventing a capability.
    // A `PL` reads and opens matters and moves none of them, so they declare nothing either.
    serve(CLOSED_UNDECLARED);
    mount(CLOSED_UNDECLARED, 'PL');
    await screen.findAllByText('Grupo Torres, S.A. de C.V.');
    expect(screen.queryByLabelText('Declarar resultado')).not.toBeInTheDocument();
    // And not merely disabled: an absent control is the product's own rule for a permission
    // the caller does not hold.
    expect(screen.queryByText('Favorable')).not.toBeInTheDocument();
  });

  it('renders the classified refusal when the declaration is refused', async () => {
    const user = userEvent.setup();
    serve(CLOSED_UNDECLARED, {
      'PATCH /tenant/cases/c1/outcome': () =>
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'Resource not found.' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    });
    mount(CLOSED_UNDECLARED);

    await user.click(await screen.findByLabelText('Declarar resultado'));
    await user.click(await screen.findByRole('option', { name: 'Favorable' }));

    // A 404 here may mean the caller was taken off the matter between opening and declaring —
    // and it is byte-identical to a matter that does not exist. The copy must not improve on it.
    expect(await screen.findByTestId('error-state-copy')).toHaveTextContent(
      'No se pudo completar esta acción. Inténtalo de nuevo.',
    );
  });
});
