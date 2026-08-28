/**
 * T058 — 019/SC-006. For every internal archetype, the controls rendered match that
 * archetype's row in `006`'s Capability Matrix exactly.
 *
 * **Both directions, and both matter.** A control shown that the server would refuse wastes
 * someone's time and teaches them the interface lies. A control hidden that the server would
 * permit silently removes a capability a firm is paying for, and nobody reports it — they
 * conclude the product cannot do it. The second is the quieter failure, which is why this
 * asserts the exact set rather than "nothing forbidden is shown".
 *
 * **This is not an authorization test.** `016a`'s `hidden-item-still-refused.spec.ts` holds
 * the property that matters for security. This one is about the interface telling the truth.
 *
 * The expectations are transcribed from `006/spec.md`'s Capability Matrix, not derived from
 * `capability-matrix.ts` — deriving them would produce a test that agrees with the code no
 * matter what either says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

vi.mock('@/session/principal', () => ({
  getPrincipal: vi.fn().mockResolvedValue({ identityId: 'identity-1', memberships: [] }),
}));
vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { CaseRegister } from '@/app/expedientes/CaseRegister';
import { CaseDetailPanel } from '@/app/expedientes/CaseDetailPanel';
import type { Archetype } from '@/session/types';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  if (/\/tenant\/cases\/[^/?]+$/.test(url.split('?')[0]!)) return respondWith(CASE)();
  return respondWith({ items: [CASE], nextCursor: null })();
}

/**
 * Transcribed from `006/spec.md`'s Capability Matrix.
 *
 *   | 29 | Read the case list   | MP ✅ AA ✅ PL ✅ CM ✅ BM ❌ SA ✅ |
 *   | 30 | Read one case        | MP ✅ AA ✅ PL ✅ CM ✅ BM ❌ SA ✅ |
 *   | 31 | Create a case        | MP ✅ AA ❌ PL ❌ CM ✅ BM ❌ SA ✅ |
 *   | 32 | Change a case status | MP ✅ AA ✅ PL ❌ CM ✅ BM ❌ SA ✅ |
 *
 * **`PL` is the row worth reading twice**: it reads the register and opens matters, and moves
 * none of them. **`BM` holds nothing at all** — Principle VI draws its line at matter content.
 */
const EXPECTED: ReadonlyArray<{
  readonly archetype: Archetype;
  readonly open: boolean;
  readonly create: boolean;
  readonly changeStatus: boolean;
}> = [
  { archetype: 'MP', open: true, create: true, changeStatus: true },
  { archetype: 'AA', open: true, create: false, changeStatus: true },
  { archetype: 'PL', open: true, create: false, changeStatus: false },
  { archetype: 'CM', open: true, create: true, changeStatus: true },
  { archetype: 'BM', open: false, create: false, changeStatus: false },
  { archetype: 'SA', open: true, create: true, changeStatus: true },
];

describe('the register offers each archetype exactly its row', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(router);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  for (const row of EXPECTED) {
    it(`${row.archetype} sees exactly its row`, async () => {
      renderWithClient(<CaseRegister archetype={row.archetype} />);
      await screen.findByRole('row', { name: /EXP-2026-0042/ });

      const shown = (pattern: RegExp): boolean =>
        screen.queryAllByRole('button', { name: pattern }).length > 0;

      expect(shown(/nuevo expediente/i), `"Nuevo expediente" for ${row.archetype}`).toBe(row.create);
      expect(shown(/^abrir /i), `"Abrir" for ${row.archetype}`).toBe(row.open);
    });
  }

  it('offers the portal archetypes nothing, because they hold nothing here', async () => {
    /*
     * CC, IC, CB and EL are absent from rows 29-33 entirely. They do not reach this screen in
     * practice — the navigation entry is not drawn for them — but a component that rendered
     * controls for them anyway would be a real defect waiting for the first deep link.
     */
    for (const archetype of ['CC', 'IC', 'CB', 'EL'] as const) {
      const view = renderWithClient(<CaseRegister archetype={archetype} />);
      await screen.findByRole('row', { name: /EXP-2026-0042/ });

      expect(screen.queryAllByRole('button', { name: /nuevo expediente/i }), archetype).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: /^abrir /i }), archetype).toHaveLength(0);

      view.unmount();
    }
  });
});

describe('an opened matter offers each archetype exactly its row', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(router);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  for (const row of EXPECTED.filter((r) => r.open)) {
    it(`${row.archetype} ${row.changeStatus ? 'may' : 'may not'} change the status`, async () => {
      renderWithClient(
        <CaseDetailPanel open caseId="c1" archetype={row.archetype} onClose={vi.fn()} />,
      );
      const panel = await screen.findByRole('dialog');
      await within(panel).findByTestId('case-team');

      const control = within(panel).queryAllByRole('combobox', { name: /cambiar estado/i });
      expect(control.length > 0, `status control for ${row.archetype}`).toBe(row.changeStatus);
    });
  }
});
