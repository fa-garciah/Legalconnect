/**
 * 013 T013 (US2, US3). Creating, editing and cancelling an event.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { EventDialog } from '@/app/calendario/EventDialog';
import { CancelEventDialog } from '@/app/calendario/CancelEventDialog';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { HEARING } from './fixtures';

const CASES = {
  items: [
    { id: 'case-1', fileNumber: 'EXP-2026-0042', client: { id: 'c', legalName: 'Grupo Torres' } },
    { id: 'case-2', fileNumber: 'EXP-2026-0043', client: { id: 'c', legalName: 'Grupo Torres' } },
  ],
  nextCursor: null,
};

describe('EventDialog', () => {
  const fetchMock = vi.fn();
  const onSaved = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const body = (method: string) => {
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === method);
    return call ? JSON.parse(call[1].body as string) : undefined;
  };

  function openCreate() {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/calendar/events': () => json({ ...HEARING, id: 'new' }, 201),
      }),
    );
    return renderWithClient(<EventDialog open mode="create" date="2026-09-30" onClose={() => {}} onSaved={onSaved} />);
  }

  it('creates a timed hearing linked to one of the caller’s cases', async () => {
    const user = userEvent.setup();
    openCreate();
    await user.type(screen.getByLabelText(/^título/i), 'Audiencia de pruebas');
    await user.clear(screen.getByLabelText(/hora de inicio/i));
    await user.type(screen.getByLabelText(/hora de inicio/i), '10:00');
    await user.type(screen.getByLabelText(/hora de fin/i), '11:30');
    await waitFor(() => expect(screen.getByRole('option', { name: /EXP-2026-0042/ })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/^expediente/i), 'case-1');
    await user.selectOptions(screen.getByLabelText(/^recordatorio/i), '1440');
    await user.click(screen.getByRole('button', { name: /guardar evento/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(body('POST')).toEqual({
      type: 'hearing',
      title: 'Audiencia de pruebas',
      allDay: false,
      startsAt: '2026-09-30T16:00:00.000Z',
      endsAt: '2026-09-30T17:30:00.000Z',
      caseId: 'case-1',
      location: null,
      description: null,
      remindMinutesBefore: 1440,
    });
  });

  it('creates an all-day deadline with dates, not times', async () => {
    const user = userEvent.setup();
    openCreate();
    await user.selectOptions(screen.getByLabelText(/^tipo/i), 'deadline');
    await user.type(screen.getByLabelText(/^título/i), 'Vence contestación');
    await user.click(screen.getByLabelText(/todo el día/i));
    expect(screen.queryByLabelText(/hora de inicio/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /guardar evento/i }));
    await waitFor(() => expect(body('POST')).toMatchObject({ allDay: true, startsOn: '2026-09-30', endsOn: null }));
    expect(body('POST').startsAt).toBeUndefined();
  });

  it('refuses an end before the start before sending', async () => {
    const user = userEvent.setup();
    openCreate();
    await user.type(screen.getByLabelText(/^título/i), 'x');
    await user.type(screen.getByLabelText(/hora de fin/i), '09:00');
    await user.click(screen.getByRole('button', { name: /guardar evento/i }));
    expect(await screen.findByText(/termina antes de empezar/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('an edit sends only the fields that changed', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/cases': () => json(CASES),
        [`PATCH /tenant/calendar/events/${HEARING.id}`]: () => json({ ...HEARING, title: 'Audiencia final' }),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<EventDialog open mode="edit" event={HEARING} onClose={() => {}} onSaved={onSaved} />);
    const title = screen.getByLabelText(/^título/i);
    expect(title).toHaveValue('Audiencia de pruebas');
    await user.clear(title);
    await user.type(title, 'Audiencia final');
    await user.click(screen.getByRole('button', { name: /guardar evento/i }));
    await waitFor(() => expect(body('PATCH')).toEqual({ title: 'Audiencia final' }));
  });

  it('a case the caller cannot reach reads in Spanish', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/calendar/events': () => json({ error: { code: 'not_found', message: 'Not found' } }, 404),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<EventDialog open mode="create" date="2026-09-30" onClose={() => {}} onSaved={onSaved} />);
    await user.type(screen.getByLabelText(/^título/i), 'x');
    await user.click(screen.getByRole('button', { name: /guardar evento/i }));
    expect(await screen.findByText(/el expediente elegido ya no está disponible/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('CancelEventDialog', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('confirms, says the event is kept, then cancels', async () => {
    fetchMock.mockImplementation(
      route({ [`PATCH /tenant/calendar/events/${HEARING.id}/cancel`]: () => json({ ...HEARING, status: 'cancelled' }) }),
    );
    const user = userEvent.setup();
    renderWithClient(<CancelEventDialog event={HEARING} onClose={() => {}} />);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/se conserva/i);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: /^cancelar evento/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
