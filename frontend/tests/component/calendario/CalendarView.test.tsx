/**
 * 013 T012, T014 (US1, US4). The month, the selected day, and "Recordatorios".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { CalendarView } from '@/app/calendario/CalendarView';
import type { Archetype } from '@/session/types';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CANCELLED, DEADLINE, HEARING, MEETING } from './fixtures';

describe('CalendarView', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(archetype: Archetype = 'AA', extra: Record<string, () => Response> = {}) {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/calendar/events': () => json({ items: [HEARING, MEETING, DEADLINE] }),
        'GET /tenant/calendar/reminders': () => json({ items: [DEADLINE] }),
        'GET /tenant/cases': () => json({ items: [], nextCursor: null }),
        ...extra,
      }),
    );
    return renderWithClient(<CalendarView archetype={archetype} today="2026-09-23" />);
  }

  const eventCalls = () => fetchMock.mock.calls.map(([url]) => String(url)).filter((u) => u.includes('/calendar/events'));

  it('titles the month and marks today', async () => {
    open();
    expect(await screen.findByRole('heading', { name: /septiembre de 2026/i })).toBeInTheDocument();
    const today = screen.getByRole('button', { name: /23 de septiembre/i });
    expect(today).toHaveAttribute('aria-current', 'date');
  });

  it('asks only for the grid’s range', async () => {
    open();
    await screen.findByRole('heading', { name: /septiembre de 2026/i });
    await waitFor(() => expect(eventCalls()).toHaveLength(1));
    expect(eventCalls()[0]).toContain('from=2026-08-31');
    expect(eventCalls()[0]).toContain('to=2026-10-05');
  });

  it('shows each day’s events in the grid', async () => {
    open();
    const day30 = await screen.findByRole('button', { name: /30 de septiembre/i });
    await waitFor(() => expect(within(day30).getByText('Vence contestación')).toBeInTheDocument());
  });

  it('lists the selected day in time order, with type, time, place and case', async () => {
    open();
    const list = await screen.findByRole('region', { name: /miércoles, 23 de septiembre/i });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Reunión con cliente');
    expect(items[1]).toHaveTextContent('Audiencia de pruebas');
    expect(items[1]).toHaveTextContent('10:00 – 11:30');
    expect(items[1]).toHaveTextContent('Audiencia');
    expect(items[1]).toHaveTextContent('Juzgado 4° Civil');
    expect(within(items[1]!).getByRole('link', { name: /EXP-2026-0042/ })).toHaveAttribute(
      'href',
      '/expedientes/case-1/documentos',
    );
  });

  it('choosing another day lists that day', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: /30 de septiembre/i }));
    const list = await screen.findByRole('region', { name: /miércoles, 30 de septiembre/i });
    expect(within(list).getByText('Vence contestación')).toBeInTheDocument();
    expect(within(list).getByText('Todo el día')).toBeInTheDocument();
  });

  it('the next month asks for its own range', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: /mes siguiente/i }));
    expect(await screen.findByRole('heading', { name: /octubre de 2026/i })).toBeInTheDocument();
    await waitFor(() => expect(eventCalls().some((u) => u.includes('from=2026-09-28') && u.includes('to=2026-11-02'))).toBe(true));
  });

  it('"Mostrar cancelados" asks for them and shows them struck through', async () => {
    const user = userEvent.setup();
    open('AA', {
      'GET /tenant/calendar/events': () => json({ items: [HEARING, MEETING, DEADLINE, CANCELLED] }),
    });
    await user.click(await screen.findByRole('button', { name: /mostrar cancelados/i }));
    await waitFor(() => expect(eventCalls().some((u) => u.includes('includeCancelled=true'))).toBe(true));
    const list = await screen.findByRole('region', { name: /miércoles, 23 de septiembre/i });
    const cancelled = (await within(list).findByText('Comida de despacho')).closest('li')!;
    expect(within(cancelled).getByText('Cancelado')).toBeInTheDocument();
  });

  it('"Recordatorios" lists the events whose reminder is due, with a count', async () => {
    open();
    const panel = await screen.findByRole('region', { name: /recordatorios/i });
    await waitFor(() => expect(within(panel).getByText('Vence contestación')).toBeInTheDocument());
    expect(within(panel).getByText('1')).toBeInTheDocument();
  });

  it('"Nuevo evento" is offered to holders of calendar.manage', async () => {
    open('PL');
    expect(await screen.findByRole('button', { name: /nuevo evento/i })).toBeInTheDocument();
  });

  it('a BM is told the calendar is not available to their role, and nothing is requested', async () => {
    open('BM');
    expect(await screen.findByText(/tu rol no tiene acceso al calendario/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
