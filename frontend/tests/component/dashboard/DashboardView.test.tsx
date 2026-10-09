/**
 * 024 T009 (US1–US3). `/`: tiles, today's events, deadlines without the word "vencido", recent
 * activity by matter — each section drawn from the server's document, each control from `can()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { DashboardView } from '@/app/DashboardView';
import type { Dashboard } from '@/dashboard/types';
import type { Archetype } from '@/session/types';
import { json, renderWithClient, route } from '../configuracion/helpers';

const CASE = { id: 'case-1', fileNumber: 'EXP-2026-0042' };

const DASHBOARD: Dashboard = {
  today: '2026-10-09',
  activeMatters: 7,
  myMinutesToday: 135,
  todayEvents: [
    { id: 'e1', type: 'hearing', title: 'Audiencia de pruebas', allDay: false, startsAt: '2026-10-09T16:00:00.000Z', startsOn: null, case: CASE },
    { id: 'e2', type: 'meeting', title: 'Junta del despacho', allDay: true, startsAt: null, startsOn: '2026-10-09', case: null },
  ],
  deadlines: {
    upcoming: [{ id: 'd1', type: 'deadline', title: 'Contestar demanda', allDay: true, startsAt: null, startsOn: '2026-10-12', case: CASE }],
    recent: [{ id: 'd2', type: 'deadline', title: 'Ofrecer pruebas', allDay: true, startsAt: null, startsOn: '2026-10-06', case: CASE }],
  },
  recentActivity: [
    {
      id: 'a1',
      action: 'document.uploaded',
      occurredAt: '2026-10-09T15:00:00.000Z',
      actor: { membershipId: 'm1', position: 'Asociado' },
      fileName: 'Demanda.pdf',
      case: CASE,
    },
  ],
};

const EMPTY: Dashboard = {
  today: '2026-10-09',
  activeMatters: 0,
  myMinutesToday: 0,
  todayEvents: [],
  deadlines: { upcoming: [], recent: [] },
  recentActivity: [],
};

describe('DashboardView', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(archetype: Archetype = 'MP', body: Dashboard = DASHBOARD) {
    fetchMock.mockImplementation(route({ 'GET /tenant/dashboard': () => json(body) }));
    return renderWithClient(<DashboardView archetype={archetype} />);
  }

  const region = (name: string) => screen.findByRole('region', { name });

  it('shows the tiles the server computed', async () => {
    open();
    const tiles = await region('Resumen de hoy');
    expect(within(tiles).getByText('7')).toBeInTheDocument();
    expect(within(tiles).getByText('Expedientes activos')).toBeInTheDocument();
    expect(within(tiles).getByText('2 h 15 min')).toBeInTheDocument();
    expect(within(tiles).getByText('Mis horas de hoy')).toBeInTheDocument();
  });

  it('omits "Mis horas de hoy" when the server says the caller is not a timekeeper', async () => {
    open('SA', { ...DASHBOARD, myMinutesToday: null });
    const tiles = await region('Resumen de hoy');
    expect(within(tiles).queryByText('Mis horas de hoy')).toBeNull();
  });

  it("lists today's events with their matter", async () => {
    open();
    const today = await region('Hoy');
    expect(within(today).getByText('Audiencia de pruebas')).toBeInTheDocument();
    expect(within(today).getByText('EXP-2026-0042')).toBeInTheDocument();
    expect(within(today).getByText('Junta del despacho')).toBeInTheDocument();
  });

  it('shows past deadlines with the reason, and never says "vencido"', async () => {
    open();
    const upcoming = await region('Plazos próximos');
    expect(within(upcoming).getByText('Contestar demanda')).toBeInTheDocument();
    const recent = await region('Plazos de los últimos 7 días');
    expect(within(recent).getByText('Ofrecer pruebas')).toBeInTheDocument();
    expect(
      within(recent).getByText('El sistema no registra si un plazo se cumplió; confirma que estos se atendieron.'),
    ).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/vencid/i);
  });

  it("writes activity as a sentence with the matter, linking to that matter's activity", async () => {
    open();
    const activity = await region('Actividad reciente');
    expect(within(activity).getByText('Asociado subió el documento «Demanda.pdf»')).toBeInTheDocument();
    expect(within(activity).getByRole('link', { name: 'EXP-2026-0042' })).toHaveAttribute('href', '/expedientes/case-1/actividad');
  });

  it('links to /kpis only for those who hold kpi.read', async () => {
    open('MP');
    expect(await screen.findByRole('link', { name: 'Ver indicadores del despacho' })).toHaveAttribute('href', '/kpis');
  });

  it('an AA gets no /kpis link', async () => {
    open('AA');
    await region('Resumen de hoy');
    expect(screen.queryByRole('link', { name: 'Ver indicadores del despacho' })).toBeNull();
  });

  it('says so, section by section, when there is nothing', async () => {
    open('AA', EMPTY);
    await region('Resumen de hoy');
    expect(screen.getAllByTestId('empty-state')).toHaveLength(4);
  });

  it('BM gets a welcome with what they can use, and nothing is requested', async () => {
    renderWithClient(<DashboardView archetype="BM" />);
    expect(await screen.findByRole('heading', { name: 'Dashboard Principal', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Clientes' })).toHaveAttribute('href', '/clientes');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
