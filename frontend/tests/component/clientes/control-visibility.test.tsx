/**
 * T046 — 018/SC-006. For every internal archetype, the controls rendered match that
 * archetype's row in `006`'s Capability Matrix exactly.
 *
 * **Both directions, and both matter.** A control shown that the server would refuse
 * wastes someone's time and teaches them the interface lies. A control hidden that the
 * server would permit silently removes a capability a firm is paying for, and nobody
 * reports it — they conclude the product cannot do it. The second failure is the quieter
 * one, which is why this asserts the exact set rather than "nothing forbidden is shown".
 *
 * **This is not an authorization test.** `016a`'s `hidden-item-still-refused.spec.ts` holds
 * the property that matters for security: the server refuses identically whether or not the
 * control was drawn (FR-015). This one is about the interface telling the truth.
 *
 * The expectations below are transcribed from `006/spec.md`'s Capability Matrix rows 25-28,
 * not derived from `capability-matrix.ts` — deriving them would produce a test that agrees
 * with the code no matter what either says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

vi.mock('@/session/principal', () => ({
  getPrincipal: vi.fn().mockResolvedValue({ identityId: 'identity-1', memberships: [] }),
}));
vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { ClientDirectory } from '@/app/clientes/ClientDirectory';
import type { Archetype } from '@/session/types';
import type { Client } from '@/clients/types';

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

const ACTIVE: Client = {
  id: 'c1',
  kind: 'organization',
  legalName: 'Grupo Torres',
  rfc: 'GTO120315AB1',
  status: 'active',
};
const WITHDRAWN: Client = { ...ACTIVE, id: 'c2', legalName: 'Juan Perez', status: 'inactive' };

/**
 * Transcribed from `006/spec.md`'s Capability Matrix.
 *
 *   | 25 | Read a client       | MP ✅ AA ✅ PL ✅ CM ✅ BM ✅ SA ✅ |
 *   | 26 | Create a client     | MP ✅ AA ❌ PL ✅ CM ❌ BM ✅ SA ✅ |
 *   | 27 | Update a client     | MP ✅ AA ❌ PL ✅ CM ❌ BM ✅ SA ✅ |
 *   | 28 | Deactivate a client | MP ✅ AA ❌ PL ❌ CM ❌ BM ✅ SA ✅ |
 *
 * `PL` is the row worth reading twice: create and update, and NOT deactivate. That split is
 * `006`'s Q1, resolved 2026-08-27 — a lawyer registers and corrects parties; taking one out
 * of circulation is a managing-partner or billing decision.
 */
const EXPECTED: ReadonlyArray<{
  readonly archetype: Archetype;
  readonly create: boolean;
  readonly update: boolean;
  readonly deactivate: boolean;
}> = [
  { archetype: 'MP', create: true, update: true, deactivate: true },
  { archetype: 'AA', create: false, update: false, deactivate: false },
  { archetype: 'PL', create: true, update: true, deactivate: false },
  { archetype: 'CM', create: false, update: false, deactivate: false },
  { archetype: 'BM', create: true, update: true, deactivate: true },
  { archetype: 'SA', create: true, update: true, deactivate: true },
];

describe('the controls each archetype is offered', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith({ items: [ACTIVE, WITHDRAWN], nextCursor: null }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  for (const row of EXPECTED) {
    it(`${row.archetype} sees exactly its row`, async () => {
      renderWithClient(<ClientDirectory archetype={row.archetype} />);
      // Every one of the six holds `client.read` (row 25), so the directory itself always
      // renders — the differences below are about what can be done with it.
      await screen.findByText('Grupo Torres');

      // `queryAll`, not `query`: the fixture has two rows, so a per-row control appears
      // twice and the singular query throws rather than reporting what it found.
      const shown = (pattern: RegExp): boolean =>
        screen.queryAllByRole('button', { name: pattern }).length > 0;

      expect(shown(/nuevo cliente/i), `"Nuevo cliente" for ${row.archetype}`).toBe(row.create);
      expect(shown(/^editar/i), `"Editar" for ${row.archetype}`).toBe(row.update);
      // One capability governs both directions — 006/FR-004a — so the active row's
      // "Retirar" and the withdrawn row's "Restaurar" appear and disappear together.
      expect(shown(/^retirar/i), `"Retirar" for ${row.archetype}`).toBe(row.deactivate);
      expect(shown(/^restaurar/i), `"Restaurar" for ${row.archetype}`).toBe(row.deactivate);
    });
  }

  it('offers the portal archetypes nothing, because they hold nothing here', async () => {
    // CC, IC, CB and EL are absent from rows 25-28 entirely. They do not reach this screen
    // in practice — the navigation entry is not drawn for them (T018) — but a component
    // that rendered controls for them anyway would be a real defect waiting for the first
    // deep link.
    for (const archetype of ['CC', 'IC', 'CB', 'EL'] as const) {
      const view = renderWithClient(<ClientDirectory archetype={archetype} />);
      await screen.findByText('Grupo Torres');

      expect(screen.queryAllByRole('button', { name: /nuevo cliente/i }), archetype).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: /^editar/i }), archetype).toHaveLength(0);
      expect(
        screen.queryAllByRole('button', { name: /^retirar|^restaurar/i }),
        archetype,
      ).toHaveLength(0);

      view.unmount();
    }
  });
});
