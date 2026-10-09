/**
 * 013 T013 (US2, US3). Creating, editing and cancelling an event.
 *
 * STATE LEAKED BETWEEN THESE TESTS until 2026-10-09, and the fix is structural, not a longer
 * timeout. Three things combined:
 *   1. `fetchMock` and `onSaved` were module-level and shared by every test; `vi.clearAllMocks()`
 *      clears calls but not implementations.
 *   2. Every query went through `screen` — the whole `document.body`.
 *   3. When a test outran its timeout under load, its `userEvent` chain kept running in the
 *      background, and its `screen` queries found the NEXT test's dialog — and pressed "Guardar
 *      evento" in it, with a half-typed title ("title: Ve").
 * Now each test gets its own mocks, every interaction is scoped to the dialog THIS test rendered
 * (a stray continuation can only reach its own, already-unmounted, dialog), and typing runs without
 * per-keystroke timers (`delay: null`), so the default 5 s is ample even under load.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
  let fetchMock: Mock;
  let onSaved: Mock;
  beforeEach(() => {
    fetchMock = vi.fn();
    onSaved = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const body = (method: string) => {
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === method);
    return call ? JSON.parse(call[1].body as string) : undefined;
  };

  /** The dialog THIS test rendered — every query goes through it, never through `screen`. */
  async function dialogOf() {
    return within(await screen.findByRole('dialog'));
  }

  async function openCreate() {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/calendar/events': () => json({ ...HEARING, id: 'new' }, 201),
      }),
    );
    renderWithClient(<EventDialog open mode="create" date="2026-09-30" onClose={() => {}} onSaved={onSaved} />);
    return dialogOf();
  }

  const typing = () => userEvent.setup({ delay: null });

  it('creates a timed hearing linked to one of the caller’s cases', async () => {
    const user = typing();
    const ui = await openCreate();
    await user.type(ui.getByLabelText(/^título/i), 'Audiencia de pruebas');
    await user.clear(ui.getByLabelText(/hora de inicio/i));
    await user.type(ui.getByLabelText(/hora de inicio/i), '10:00');
    await user.type(ui.getByLabelText(/hora de fin/i), '11:30');
    await waitFor(() => expect(ui.getByRole('option', { name: /EXP-2026-0042/ })).toBeInTheDocument());
    await user.selectOptions(ui.getByLabelText(/^expediente/i), 'case-1');
    await user.selectOptions(ui.getByLabelText(/^recordatorio/i), '1440');
    await user.click(ui.getByRole('button', { name: /guardar evento/i }));

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
    const user = typing();
    const ui = await openCreate();
    await user.selectOptions(ui.getByLabelText(/^tipo/i), 'deadline');
    await user.type(ui.getByLabelText(/^título/i), 'Vence contestación');
    await user.click(ui.getByLabelText(/todo el día/i));
    expect(ui.queryByLabelText(/hora de inicio/i)).not.toBeInTheDocument();
    await user.click(ui.getByRole('button', { name: /guardar evento/i }));
    await waitFor(() => expect(body('POST')).toMatchObject({ allDay: true, startsOn: '2026-09-30', endsOn: null }));
    expect(body('POST').startsAt).toBeUndefined();
  });

  it('refuses an end before the start before sending', async () => {
    const user = typing();
    const ui = await openCreate();
    await user.type(ui.getByLabelText(/^título/i), 'x');
    await user.type(ui.getByLabelText(/hora de fin/i), '09:00');
    await user.click(ui.getByRole('button', { name: /guardar evento/i }));
    expect(await ui.findByText(/termina antes de empezar/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('an edit sends only the fields that changed', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/cases': () => json(CASES),
        [`PATCH /tenant/calendar/events/${HEARING.id}`]: () => json({ ...HEARING, title: 'Audiencia final' }),
      }),
    );
    const user = typing();
    renderWithClient(<EventDialog open mode="edit" event={HEARING} onClose={() => {}} onSaved={onSaved} />);
    const ui = await dialogOf();
    const title = ui.getByLabelText(/^título/i);
    expect(title).toHaveValue('Audiencia de pruebas');
    await user.clear(title);
    await user.type(title, 'Audiencia final');
    await user.click(ui.getByRole('button', { name: /guardar evento/i }));
    await waitFor(() => expect(body('PATCH')).toEqual({ title: 'Audiencia final' }));
  });

  it('a case the caller cannot reach reads in Spanish', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/calendar/events': () => json({ error: { code: 'not_found', message: 'Not found' } }, 404),
      }),
    );
    const user = typing();
    renderWithClient(<EventDialog open mode="create" date="2026-09-30" onClose={() => {}} onSaved={onSaved} />);
    const ui = await dialogOf();
    await user.type(ui.getByLabelText(/^título/i), 'x');
    await user.click(ui.getByRole('button', { name: /guardar evento/i }));
    expect(await ui.findByText(/el expediente elegido ya no está disponible/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('CancelEventDialog', () => {
  let fetchMock: Mock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('confirms, says the event is kept, then cancels', async () => {
    fetchMock.mockImplementation(
      route({ [`PATCH /tenant/calendar/events/${HEARING.id}/cancel`]: () => json({ ...HEARING, status: 'cancelled' }) }),
    );
    const user = userEvent.setup({ delay: null });
    renderWithClient(<CancelEventDialog event={HEARING} onClose={() => {}} />);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/se conserva/i);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: /^cancelar evento/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
