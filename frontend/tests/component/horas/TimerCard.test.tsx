/**
 * 009 T025 (US1). The timer: idle → start on a matter → running, ticking → stop with a description,
 * or discard. The timer is server state, so every view of it comes from `GET …/timer`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { TimerCard } from '@/app/horas/TimerCard';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASES, FRESH, RUNNING, refusal } from './fixtures';

describe('TimerCard', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const calls = (method: string, fragment: string) =>
    fetchMock.mock.calls.filter(([url, init]) => String(url).includes(fragment) && (init?.method ?? 'GET') === method);

  it('idle: choose a matter and start; the request names that matter', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      route({
        'GET /tenant/time-entries/timer': () => json({ timer: null }),
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/cases/case-2/time-entries/timer': () => json({ ...RUNNING, case: { id: 'case-2', fileNumber: 'EXP-2026-0007' } }, 201),
      }),
    );
    renderWithClient(<TimerCard />);
    const select = await screen.findByLabelText('Expediente del cronómetro');
    await waitFor(() => expect(screen.getByRole('option', { name: /EXP-2026-0007/ })).toBeInTheDocument());
    await user.selectOptions(select, 'case-2');
    await user.click(screen.getByRole('button', { name: 'Iniciar cronómetro' }));
    await waitFor(() => expect(calls('POST', '/case-2/time-entries/timer')).toHaveLength(1));
  });

  it('"Iniciar" is not offered before a matter is chosen', async () => {
    fetchMock.mockImplementation(
      route({ 'GET /tenant/time-entries/timer': () => json({ timer: null }), 'GET /tenant/cases': () => json(CASES) }),
    );
    renderWithClient(<TimerCard />);
    expect(await screen.findByRole('button', { name: 'Iniciar cronómetro' })).toBeDisabled();
  });

  it('running: shows the matter and a ticking clock', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-08T16:01:05.000Z') });
    fetchMock.mockImplementation(route({ 'GET /tenant/time-entries/timer': () => json({ timer: RUNNING }), 'GET /tenant/cases': () => json(CASES) }));
    renderWithClient(<TimerCard />);
    expect(await screen.findByText('EXP-2026-0042')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:01:05');
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('00:01:07');
  });

  it('stopping requires a description, then sends it to the timer’s own matter', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      route({
        'GET /tenant/time-entries/timer': () => json({ timer: RUNNING }),
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/cases/case-1/time-entries/timer/stop': () => json(FRESH, 201),
      }),
    );
    renderWithClient(<TimerCard />);
    await user.click(await screen.findByRole('button', { name: 'Detener y registrar' }));
    expect(await screen.findByText('Describe el trabajo realizado.')).toBeInTheDocument();
    expect(calls('POST', '/timer/stop')).toHaveLength(0);
    await user.type(screen.getByLabelText('Descripción del trabajo'), 'Redacción de demanda');
    await user.click(screen.getByRole('button', { name: 'Detener y registrar' }));
    await waitFor(() => expect(calls('POST', '/case-1/time-entries/timer/stop')).toHaveLength(1));
    const [, init] = calls('POST', '/timer/stop')[0]!;
    expect(JSON.parse(String(init!.body))).toEqual({ description: 'Redacción de demanda' });
  });

  it('a second start is explained in Spanish', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      route({
        'GET /tenant/time-entries/timer': () => json({ timer: null }),
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/cases/case-1/time-entries/timer': () => json(refusal(409, 'timer_running'), 409),
      }),
    );
    renderWithClient(<TimerCard />);
    await waitFor(() => expect(screen.getByRole('option', { name: /EXP-2026-0042/ })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Expediente del cronómetro'), 'case-1');
    await user.click(screen.getByRole('button', { name: 'Iniciar cronómetro' }));
    expect(await screen.findByText('Ya tienes un cronómetro en marcha.')).toBeInTheDocument();
  });

  it('a timer past 24 hours explains why it cannot be stopped', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      route({
        'GET /tenant/time-entries/timer': () => json({ timer: { ...RUNNING, description: 'x' } }),
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/cases/case-1/time-entries/timer/stop': () => json(refusal(409, 'timer_too_long'), 409),
      }),
    );
    renderWithClient(<TimerCard />);
    await user.click(await screen.findByRole('button', { name: 'Detener y registrar' }));
    expect(await screen.findByText(/más de 24 horas/i)).toBeInTheDocument();
  });

  it('a matter no longer available: only "Descartar", which discards', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      route({
        'GET /tenant/time-entries/timer': () => json({ timer: { ...RUNNING, case: null, caseAvailable: false } }),
        'GET /tenant/cases': () => json(CASES),
        'POST /tenant/time-entries/timer/discard': () => json({ id: RUNNING.id }),
      }),
    );
    renderWithClient(<TimerCard />);
    expect(await screen.findByText(/el expediente de este cronómetro ya no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detener y registrar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(calls('POST', '/timer/discard')).toHaveLength(1));
  });
});
