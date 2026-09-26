/**
 * T015, T017, T019 — the KPI screen. 015/FR-008 … FR-016.
 *
 * WHAT IS ASSERTED HERE IS MOSTLY ABSENCE, and deliberately:
 *
 *   - a null figure renders "Sin datos", never "0";
 *   - a missing delta renders no element at all, never "0 %";
 *   - a withheld success rate says "Datos insuficientes" and names how many declarations are
 *     missing, rather than printing a percentage;
 *   - there is **no** Ingresos tile and **no** Financiero tab, because nothing in the schema can
 *     produce them (Decision 2) — an absence worth pinning, since the mockup shows both and a
 *     future reader will otherwise assume they were forgotten.
 *
 * The charts themselves are asserted through their TABLES (FR-012): that is the accessible
 * contract, it is what a person who cannot see the bars reads, and it is the part that carries
 * the numbers. `recharts` needs a real layout box that jsdom does not provide, so asserting
 * pixels here would test the mock rather than the screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { KpiDashboard } from '@/app/kpis/KpiDashboard';
import { json, renderWithClient, route } from '../configuracion/helpers';

const FULL = {
  period: {
    kind: 'quarter',
    from: '2026-07-01',
    to: '2026-09-30',
    previousFrom: '2026-04-01',
    previousTo: '2026-06-30',
  },
  activeCases: { value: 21, previous: 0, delta: null },
  averageResolutionMonths: { value: 4.78, previous: 3.79, delta: 0.99, sampleSize: 8 },
  successRate: { value: 0.89, previous: 0.75, delta: 0.14, sampleSize: 9, undeclared: 0 },
  casesPerAttorney: [
    { membershipId: 'm-1', position: 'Asociado Senior', activeCases: 16 },
    { membershipId: 'm-2', position: 'Asociado', activeCases: 10 },
    { membershipId: null, position: null, activeCases: 1 },
  ],
  successRateByMatterType: [
    { matterTypeId: 't-1', name: 'Mercantil', rate: 0.8, sampleSize: 10 },
    { matterTypeId: null, name: null, rate: null, sampleSize: 0 },
  ],
  resolutionTrend: [
    { quarterStart: '2025-04-01', averageMonths: null, sampleSize: 0 },
    { quarterStart: '2025-07-01', averageMonths: 6.2, sampleSize: 3 },
    { quarterStart: '2025-10-01', averageMonths: 4.1, sampleSize: 4 },
    { quarterStart: '2026-01-01', averageMonths: 8.8, sampleSize: 2 },
    { quarterStart: '2026-04-01', averageMonths: 3.7, sampleSize: 5 },
    { quarterStart: '2026-07-01', averageMonths: 4.8, sampleSize: 8 },
  ],
};

const THIN = {
  ...FULL,
  activeCases: { value: 0, previous: 0, delta: null },
  averageResolutionMonths: { value: null, previous: null, delta: null, sampleSize: 0 },
  successRate: { value: null, previous: null, delta: null, sampleSize: 2, undeclared: 4 },
  casesPerAttorney: [],
  successRateByMatterType: [],
  resolutionTrend: FULL.resolutionTrend.map((q) => ({ ...q, averageMonths: null, sampleSize: 0 })),
};

describe('KpiDashboard', () => {
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function mount(payload: unknown = FULL) {
    fetchMock.mockImplementation(route({ 'GET /tenant/kpis': () => json(payload) }));
    return renderWithClient(<KpiDashboard />);
  }

  it('names the screen', async () => {
    mount();
    expect(
      await screen.findByRole('heading', { name: 'Panel de indicadores', level: 1 }),
    ).toBeInTheDocument();
  });

  describe('the tiles', () => {
    it('shows active matters, resolution time and success rate', async () => {
      mount();
      expect(await screen.findByTestId('tile-activos-value')).toHaveTextContent('21');
      expect(screen.getByTestId('tile-resolucion-value')).toHaveTextContent('4.8 m');
      expect(screen.getByTestId('tile-exito-value')).toHaveTextContent('89 %');
    });

    it('shows a signed delta against the previous period', async () => {
      mount();
      expect(await screen.findByTestId('tile-resolucion-delta')).toHaveTextContent('+1.0 m');
      // A percentage figure's change is in POINTS, because "+14 %" of a percentage is ambiguous.
      expect(screen.getByTestId('tile-exito-delta')).toHaveTextContent('+14 pp');
    });

    it('shows the sample each average came from', async () => {
      mount();
      expect(await screen.findByTestId('tile-resolucion-sample')).toHaveTextContent('8 asuntos');
    });

    it('draws NO delta on the active-matter count', async () => {
      // It is a fact about today, and the product keeps no historical snapshot to compare it
      // with. A "0" here would assert something about last quarter that nobody recorded.
      mount();
      await screen.findByTestId('tile-activos-value');
      expect(screen.queryByTestId('tile-activos-delta')).not.toBeInTheDocument();
    });

    it('renders "Sin datos" rather than 0 when there is no figure', async () => {
      mount(THIN);
      expect(await screen.findByTestId('tile-resolucion-value')).toHaveTextContent('Sin datos');
    });

    it('renders NO delta element at all when there is nothing to compare', async () => {
      mount(THIN);
      await screen.findByTestId('tile-resolucion-value');
      expect(screen.queryByTestId('tile-resolucion-delta')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tile-exito-delta')).not.toBeInTheDocument();
    });

    it('withholds a thin success rate and says why', async () => {
      mount(THIN);
      expect(await screen.findByTestId('tile-exito-notice')).toHaveTextContent('Datos insuficientes');
      expect(screen.queryByTestId('tile-exito-value')).not.toBeInTheDocument();
      // And names how many closed matters have no declaration, so the remedy is obvious.
      expect(screen.getByTestId('tile-exito-sample')).toHaveTextContent('4 sin resultado declarado');
    });

    it('still shows a real zero as zero — a firm with no active matters', async () => {
      // `0` is data; `null` is the absence of an answer. Conflating them reports a working firm
      // as empty.
      mount(THIN);
      expect(await screen.findByTestId('tile-activos-value')).toHaveTextContent('0');
    });
  });

  describe('what is deliberately not here (Decision 2)', () => {
    it('has no Ingresos tile', async () => {
      mount();
      await screen.findByTestId('tile-activos-value');
      expect(screen.queryByText(/ingresos/i)).not.toBeInTheDocument();
    });

    it('has no Financiero tab', async () => {
      mount();
      await screen.findByTestId('tile-activos-value');
      expect(screen.queryByRole('tab', { name: /financiero/i })).not.toBeInTheDocument();
    });

    it('renders no money vocabulary anywhere on the screen (SC-008)', async () => {
      /*
       * T025 asks for this as a grep, and a grep cannot distinguish the word "Ingresos" in a
       * comment explaining its own absence from the word on a tile — this file's own header
       * trips it. So the check is made where it means something: against what the screen
       * actually renders, on both tabs.
       */
      const user = userEvent.setup();
      mount();
      await screen.findByTestId('tile-activos-value');
      const MONEY = /ingreso|facturaci|honorario|revenue|invoice|\$\s?\d/i;
      expect(document.body.textContent).not.toMatch(MONEY);
      await user.click(screen.getByRole('tab', { name: 'Asuntos' }));
      await screen.findByTestId('chart-row-t-1');
      expect(document.body.textContent).not.toMatch(MONEY);
    });

    it('offers exactly the two tabs that have data behind them', async () => {
      mount();
      await screen.findByTestId('tile-activos-value');
      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs).toEqual(['Rendimiento', 'Asuntos']);
    });
  });

  describe('the period selector', () => {
    it('asks the server again for the chosen period', async () => {
      const user = userEvent.setup();
      mount();
      await screen.findByTestId('tile-activos-value');

      await user.click(screen.getByLabelText('Periodo'));
      await user.click(await screen.findByRole('option', { name: 'Último año' }));

      await waitFor(() => {
        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('period=year'))).toBe(true);
      });
    });
  });

  describe('every chart carries its numbers as a table (FR-012)', () => {
    it('workload: one row per responsible, including the unassigned group', async () => {
      mount();
      const row = await screen.findByTestId('chart-row-m-1');
      expect(within(row).getByText('Asociado Senior')).toBeInTheDocument();
      expect(within(row).getByText('16')).toBeInTheDocument();
      // FR-006 — matters nobody leads get their own named row, never dropped.
      const orphan = screen.getByTestId('chart-row-sin-responsable');
      expect(within(orphan).getByText('Sin responsable')).toBeInTheDocument();
    });

    it('workload: carries no email — an aggregate holds no personal data (Decision 10)', async () => {
      mount();
      await screen.findByTestId('chart-row-m-1');
      expect(document.body.textContent).not.toContain('@');
    });

    it('trend: a quarter with nothing closed reads "Sin datos", not 0', async () => {
      mount();
      const row = await screen.findByTestId('chart-row-2025-04-01');
      expect(within(row).getByText('Sin datos')).toBeInTheDocument();
      expect(within(row).getByText('Sin asuntos en el periodo')).toBeInTheDocument();
      expect(within(row).queryByText('0.0 m')).not.toBeInTheDocument();
    });

    it('trend: labels quarters the way a firm names them', async () => {
      mount();
      const row = await screen.findByTestId('chart-row-2026-07-01');
      expect(within(row).getByText('3T 2026')).toBeInTheDocument();
    });

    it('by type: every rate travels with its sample size (FR-009a)', async () => {
      const user = userEvent.setup();
      mount();
      await screen.findByTestId('tile-activos-value');
      await user.click(screen.getByRole('tab', { name: 'Asuntos' }));

      const row = await screen.findByTestId('chart-row-t-1');
      expect(within(row).getByText('Mercantil')).toBeInTheDocument();
      expect(within(row).getByText('80 %')).toBeInTheDocument();
      expect(within(row).getByText('10 asuntos')).toBeInTheDocument();
    });

    it('by type: untyped matters get their own named row (FR-007)', async () => {
      const user = userEvent.setup();
      mount();
      await screen.findByTestId('tile-activos-value');
      await user.click(screen.getByRole('tab', { name: 'Asuntos' }));

      const row = await screen.findByTestId('chart-row-sin-tipo');
      expect(within(row).getByText('Sin tipo')).toBeInTheDocument();
      expect(within(row).getByText('Sin datos')).toBeInTheDocument();
    });
  });

  it('renders the classified error state when the read is refused', async () => {
    fetchMock.mockImplementation(
      route({ 'GET /tenant/kpis': () => json({ error: { code: 'not_authorized' } }, 403) }),
    );
    renderWithClient(<KpiDashboard />);
    expect(await screen.findByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByTestId('error-state-copy')).toHaveTextContent(
      'Tu rol actual no permite esta acción.',
    );
  });
});
