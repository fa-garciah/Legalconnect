/**
 * 009 T024 (US3). The timesheet: grouped by day, totals as the server computed them, ranges.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { TimesheetView } from '@/app/horas/TimesheetView';
import type { Archetype } from '@/session/types';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASES, EMPTY_SHEET, SHEET, TODAY } from './fixtures';

describe('TimesheetView', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(archetype: Archetype = 'AA', extra: Record<string, () => Response> = {}) {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/time-entries': () => json(SHEET),
        'GET /tenant/time-entries/timer': () => json({ timer: null }),
        'GET /tenant/cases': () => json(CASES),
        ...extra,
      }),
    );
    return renderWithClient(<TimesheetView archetype={archetype} today={TODAY} />);
  }

  const sheetCalls = () =>
    fetchMock.mock.calls.map(([url]) => String(url)).filter((u) => /\/tenant\/time-entries\?/.test(u));

  it('asks for this week, Monday to the next Monday, by default', async () => {
    open();
    await screen.findByRole('heading', { name: 'Registro de Horas', level: 1 });
    await waitFor(() => expect(sheetCalls()).toHaveLength(1));
    expect(sheetCalls()[0]).toContain('from=2026-10-05');
    expect(sheetCalls()[0]).toContain('to=2026-10-12');
  });

  it('shows the range total and each day total exactly as the server sent them', async () => {
    open();
    expect(await screen.findByText('4 h 15 min')).toBeInTheDocument();
    const thursday = await screen.findByRole('region', { name: /jueves, 8 de octubre/i });
    expect(within(thursday).getByText('Total: 2 h 15 min')).toBeInTheDocument();
    const tuesday = screen.getByRole('region', { name: /martes, 6 de octubre/i });
    expect(within(tuesday).getByText('Total: 2 h')).toBeInTheDocument();
  });

  it('lists each entry with its matter, description, duration and source', async () => {
    open();
    const thursday = await screen.findByRole('region', { name: /jueves, 8 de octubre/i });
    const items = within(thursday).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('EXP-2026-0042');
    expect(items[0]).toHaveTextContent('Redacción de contestación de demanda');
    expect(items[0]).toHaveTextContent('1 h 30 min');
    expect(items[0]).toHaveTextContent('Cronómetro');
    expect(items[1]).toHaveTextContent('Manual');
  });

  it('offers "Corregir" and "Eliminar" only while the server says the entry is correctable', async () => {
    open();
    const thursday = await screen.findByRole('region', { name: /jueves, 8 de octubre/i });
    expect(within(thursday).getAllByRole('button', { name: /corregir/i })).toHaveLength(2);
    const tuesday = screen.getByRole('region', { name: /martes, 6 de octubre/i });
    expect(within(tuesday).queryByRole('button', { name: /corregir/i })).toBeNull();
    expect(within(tuesday).queryByRole('button', { name: /eliminar/i })).toBeNull();
  });

  it('the presets ask for their own ranges', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByText('4 h 15 min');
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await waitFor(() => expect(sheetCalls().some((u) => u.includes('from=2026-09-28') && u.includes('to=2026-10-05'))).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Este mes' }));
    await waitFor(() => expect(sheetCalls().some((u) => u.includes('from=2026-10-01') && u.includes('to=2026-11-01'))).toBe(true));
  });

  it('a custom range longer than 62 days is refused before anything is sent', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByText('4 h 15 min');
    const before = sheetCalls().length;
    await user.clear(screen.getByLabelText('Desde'));
    await user.type(screen.getByLabelText('Desde'), '2026-07-01');
    await user.clear(screen.getByLabelText('Hasta'));
    await user.type(screen.getByLabelText('Hasta'), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText('El periodo no puede pasar de 62 días.')).toBeInTheDocument();
    expect(sheetCalls()).toHaveLength(before);
  });

  it('an empty range shows the empty state, and "Registrar horas" for those who may', async () => {
    open('PL', { 'GET /tenant/time-entries': () => json(EMPTY_SHEET) });
    expect(await screen.findByText(/no hay horas registradas en este periodo/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /registrar horas/i }).length).toBeGreaterThan(0);
  });

  it('a failed request shows the error state with a retry', async () => {
    open('AA', { 'GET /tenant/time-entries': () => json({ error: { code: 'internal', message: 'x' } }, 500) });
    expect(await screen.findByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it.each(['BM', 'SA'] as const)('%s is told the screen is not for their role, and nothing is requested', async (archetype) => {
    open(archetype);
    expect(await screen.findByText(/tu rol no registra horas/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
