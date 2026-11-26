/**
 * Staffing a matter from its detail panel — `006`'s `POST`/`DELETE /tenant/cases/:id/team`
 * (row 33, `case.manage_team`: MP, CM, SA), which nothing in the frontend called before.
 *
 * Without it an AA, PL or CM could only ever see the matters the demo seed had put them on.
 *
 * Also: the team reads as people, not membership ids. SA and MP resolve each member's email
 * through `GET /tenant/members`; everyone else, who may not read emails (row 5), sees role and
 * position from `GET /tenant/directory` (row 24).
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
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
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
  venueCaseReference: null,
  openedOn: '2026-03-04',
  closedOn: null,
  outcome: null,
  team: [{ membershipId: 'm-1', roleOnCase: 'lead', assignedAt: '2026-03-04T00:00:00.000Z' }],
};

const MEMBERS = {
  items: [
    { membershipId: 'm-1', email: 'socia@despacho.mx', archetype: 'MP', positionName: 'Socia' },
    { membershipId: 'm-2', email: 'abogado@despacho.mx', archetype: 'AA', positionName: null },
    { membershipId: 'm-3', email: 'pasante@despacho.mx', archetype: 'PL', positionName: null },
    { membershipId: 'm-4', email: 'cobranza@despacho.mx', archetype: 'BM', positionName: null },
  ],
};

const DIRECTORY = {
  items: [
    { membershipId: 'm-1', archetype: 'MP', positionId: 'p1', positionName: 'Socia' },
    { membershipId: 'm-2', archetype: 'AA', positionId: null, positionName: null },
  ],
  nextCursor: null,
};

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

function router(calls: Call[], overrides: { post?: () => Promise<Response> } = {}) {
  return (input: string, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });

    if (url.includes('case-catalogs')) {
      return json({ items: [{ id: 'st1', name: 'En Proceso', status: 'active', isClosing: false }] });
    }
    if (url.includes('/tenant/members')) return json(MEMBERS);
    if (url.includes('/tenant/directory')) return json(DIRECTORY);
    if (url.includes('/team') && method === 'POST') {
      return overrides.post
        ? overrides.post()
        : json({ caseId: 'c1', membershipId: 'm-2', roleOnCase: 'support', assignedAt: 'now' }, 201);
    }
    if (url.includes('/team/') && method === 'DELETE') {
      return json({ caseId: 'c1', membershipId: 'm-1', roleOnCase: 'lead', assignedAt: 'x', unassignedAt: 'y' });
    }
    return json(DETAIL);
  };
}

describe('the case team reads as people', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('SA sees each member by email, never by membership id', async () => {
    fetchMock.mockImplementation(router([]));
    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="SA" onClose={vi.fn()} />);

    const team = await within(await screen.findByRole('dialog')).findByTestId('case-team');
    expect(await within(team).findByText('socia@despacho.mx')).toBeInTheDocument();
    expect(team.textContent ?? '').not.toContain('m-1');
  });

  it('an AA, who may not read emails, sees role and position from the directory', async () => {
    const calls: Call[] = [];
    fetchMock.mockImplementation(router(calls));
    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="AA" onClose={vi.fn()} />);

    const team = await within(await screen.findByRole('dialog')).findByTestId('case-team');
    expect(await within(team).findByText(/Socio · Socia/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/tenant/members'))).toBe(false);
  });
});

describe('staffing a matter', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('AA and PL get no staffing controls', async () => {
    for (const archetype of ['AA', 'PL'] as const) {
      fetchMock.mockImplementation(router([]));
      const { unmount } = renderWithClient(
        <CaseDetailPanel open caseId="c1" archetype={archetype} onClose={vi.fn()} />,
      );
      const panel = await screen.findByRole('dialog');
      await within(panel).findByTestId('case-team');
      expect(within(panel).queryByRole('button', { name: /agregar al equipo/i })).toBeNull();
      expect(within(panel).queryByRole('button', { name: /quitar/i })).toBeNull();
      unmount();
    }
  });

  it('SA adds a person with a role; the request carries both and the case reloads', async () => {
    const calls: Call[] = [];
    fetchMock.mockImplementation(router(calls));
    const user = userEvent.setup();
    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="SA" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    const person = await within(panel).findByLabelText('Persona');
    // Somebody already on the matter is not offered again.
    await waitFor(() =>
      expect(within(person).getByRole('option', { name: /abogado@despacho\.mx/ })).toBeInTheDocument(),
    );
    expect(within(person).queryByRole('option', { name: /socia@despacho\.mx/ })).toBeNull();
    // Facturación y cobranza cannot open a matter, so it is not offered as staff for one.
    expect(within(person).queryByRole('option', { name: /cobranza@despacho\.mx/ })).toBeNull();

    await user.selectOptions(person, 'm-2');
    await user.selectOptions(within(panel).getByLabelText('Papel en el expediente'), 'support');
    const caseReadsBefore = calls.filter((c) => c.method === 'GET' && c.url.endsWith('/tenant/cases/c1')).length;
    await user.click(within(panel).getByRole('button', { name: /agregar al equipo/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST');
      expect(post?.url).toMatch(/\/tenant\/cases\/c1\/team$/);
      expect(post?.body).toEqual({ membershipId: 'm-2', roleOnCase: 'support' });
    });
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET' && c.url.endsWith('/tenant/cases/c1')).length).toBeGreaterThan(
        caseReadsBefore,
      ),
    );
  });

  it('CM removes someone from the matter', async () => {
    const calls: Call[] = [];
    fetchMock.mockImplementation(router(calls));
    const user = userEvent.setup();
    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="CM" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    await user.click(await within(panel).findByRole('button', { name: /quitar/i }));

    await waitFor(() => {
      const del = calls.find((c) => c.method === 'DELETE');
      expect(del?.url).toMatch(/\/tenant\/cases\/c1\/team\/m-1$/);
    });
  });

  it('says so in Spanish when the person is already on the matter', async () => {
    fetchMock.mockImplementation(
      router([], {
        post: () =>
          json({ error: { code: 'already_assigned', message: 'That member is already assigned to this case.' } }, 409),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<CaseDetailPanel open caseId="c1" archetype="SA" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    const person = await within(panel).findByLabelText('Persona');
    await waitFor(() => expect(within(person).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(person, 'm-2');
    await user.click(within(panel).getByRole('button', { name: /agregar al equipo/i }));

    expect(await within(panel).findByText(/ya está en el equipo/i)).toBeInTheDocument();
    expect(panel.textContent ?? '').not.toMatch(/already assigned/i);
  });
});
