/**
 * 009 T026 (US2, US4). Recording time by hand, correcting it, voiding it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { LogTimeDialog } from '@/app/horas/LogTimeDialog';
import { VoidEntryDialog } from '@/app/horas/VoidEntryDialog';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASES, FRESH, TODAY, refusal } from './fixtures';

describe('LogTimeDialog', () => {
  const fetchMock = vi.fn();
  const onClose = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const sent = (method: string, fragment: string) =>
    fetchMock.mock.calls.filter(([url, init]) => String(url).includes(fragment) && (init?.method ?? 'GET') === method);

  describe('recording (US2)', () => {
    beforeEach(() => {
      fetchMock.mockImplementation(
        route({
          'GET /tenant/cases': () => json(CASES),
          'POST /tenant/cases/case-2/time-entries': () => json({ ...FRESH, source: 'manual' }, 201),
        }),
      );
    });

    it('sends the matter in the URL and one integer of minutes', async () => {
      const user = userEvent.setup();
      renderWithClient(<LogTimeDialog mode="create" today={TODAY} onClose={onClose} />);
      await waitFor(() => expect(screen.getByRole('option', { name: /EXP-2026-0007/ })).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Expediente'), 'case-2');
      fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-07' } });
      await user.type(screen.getByLabelText('Horas'), '1');
      await user.type(screen.getByLabelText('Minutos'), '30');
      await user.type(screen.getByLabelText('Descripción'), 'Llamada con el cliente');
      await user.click(screen.getByRole('button', { name: 'Registrar' }));
      await waitFor(() => expect(sent('POST', '/case-2/time-entries')).toHaveLength(1));
      const [, init] = sent('POST', '/case-2/time-entries')[0]!;
      expect(JSON.parse(String(init!.body))).toEqual({ workDate: '2026-10-07', minutes: 90, description: 'Llamada con el cliente' });
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    }, 15_000);

    it('refuses before sending: no matter, a future date, zero, more than a day, no description', async () => {
      const user = userEvent.setup();
      renderWithClient(<LogTimeDialog mode="create" today={TODAY} onClose={onClose} />);
      fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '2026-10-09' } });
      await user.type(screen.getByLabelText('Horas'), '25');
      await user.click(screen.getByRole('button', { name: 'Registrar' }));
      expect(await screen.findByText('Elige el expediente.')).toBeInTheDocument();
      expect(screen.getByText('No puedes registrar horas en una fecha futura.')).toBeInTheDocument();
      expect(screen.getByText('La duración no puede pasar de 24 horas.')).toBeInTheDocument();
      expect(screen.getByText('Describe el trabajo realizado.')).toBeInTheDocument();
      expect(sent('POST', '/time-entries')).toHaveLength(0);
    }, 15_000);
  });

  describe('correcting (US4)', () => {
    it('shows the matter fixed, and sends only the fields that changed', async () => {
      const user = userEvent.setup();
      fetchMock.mockImplementation(
        route({
          'GET /tenant/cases': () => json(CASES),
          'PATCH /tenant/cases/case-1/time-entries/te-fresh': () => json({ ...FRESH, minutes: 30 }),
        }),
      );
      renderWithClient(<LogTimeDialog mode="edit" entry={FRESH} today={TODAY} onClose={onClose} />);
      expect(await screen.findByText('EXP-2026-0042')).toBeInTheDocument();
      expect(screen.queryByLabelText('Expediente')).toBeNull();
      expect(screen.getByLabelText('Horas')).toHaveValue('1');
      expect(screen.getByLabelText('Minutos')).toHaveValue('30');
      await user.clear(screen.getByLabelText('Horas'));
      await user.type(screen.getByLabelText('Horas'), '0');
      await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));
      await waitFor(() => expect(sent('PATCH', '/te-fresh')).toHaveLength(1));
      expect(JSON.parse(String(sent('PATCH', '/te-fresh')[0]![1]!.body))).toEqual({ minutes: 30 });
    });

    it('explains a closed window in Spanish', async () => {
      const user = userEvent.setup();
      fetchMock.mockImplementation(
        route({
          'GET /tenant/cases': () => json(CASES),
          'PATCH /tenant/cases/case-1/time-entries/te-fresh': () => json(refusal(409, 'correction_window_closed'), 409),
        }),
      );
      renderWithClient(<LogTimeDialog mode="edit" entry={FRESH} today={TODAY} onClose={onClose} />);
      await user.type(await screen.findByLabelText('Descripción'), ' (revisado)');
      await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));
      expect(await screen.findByText(/ya pasaron las 24 horas/i)).toBeInTheDocument();
    });
  });

  describe('voiding (US4)', () => {
    it('confirms, says it is kept, and voids', async () => {
      const user = userEvent.setup();
      fetchMock.mockImplementation(route({ 'POST /tenant/cases/case-1/time-entries/te-fresh/void': () => json({ id: 'te-fresh' }) }));
      renderWithClient(<VoidEntryDialog entry={FRESH} onClose={onClose} />);
      expect(await screen.findByText(/se conserva en el historial/i)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Eliminar registro' }));
      await waitFor(() => expect(sent('POST', '/te-fresh/void')).toHaveLength(1));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
  });
});
