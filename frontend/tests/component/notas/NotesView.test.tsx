/**
 * 008 T019 (US1, US2, US3). A matter's notes: one month at a time, a composer that refuses a blank or
 * over-long note before sending, and correction offered only while the server says it is open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { NotesView } from '@/app/expedientes/[caseId]/notas/NotesView';
import type { Archetype } from '@/session/types';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASE_ID, MONTH, NOTES, NO_NOTES, OWN_FRESH } from './fixtures';

const NOTES_PATH = `/tenant/cases/${CASE_ID}/notes`;

describe('NotesView', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(archetype: Archetype = 'AA', extra: Record<string, () => Response> = {}, list = NOTES) {
    fetchMock.mockImplementation(route({ [`GET ${NOTES_PATH}`]: () => json(list), ...extra }));
    return renderWithClient(<NotesView caseId={CASE_ID} archetype={archetype} month={MONTH} />);
  }

  const calls = (method: string) =>
    fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method).map(([url]) => String(url));

  it('asks for the month shown, and titles the list with it', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Octubre de 2026', level: 2 })).toBeInTheDocument();
    expect(calls('GET')[0]).toContain('month=2026-10');
  });

  it('lists each note with its author’s position and text, newest first', async () => {
    open();
    const items = await screen.findAllByRole('article');
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText(OWN_FRESH.body)).toBeInTheDocument();
    expect(within(items[0]!).getByText('Asociado')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Pasante')).toBeInTheDocument();
  });

  it('moves to the previous month on request', async () => {
    open();
    await screen.findAllByRole('article');
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    await waitFor(() => expect(calls('GET').some((u) => u.includes('month=2026-09'))).toBe(true));
  });

  it('offers Corregir and Eliminar only on the note whose window the server says is open', async () => {
    open();
    const items = await screen.findAllByRole('article');
    expect(within(items[0]!).getByRole('button', { name: 'Corregir' })).toBeInTheDocument();
    expect(within(items[0]!).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    for (const item of items.slice(1)) {
      expect(within(item).queryByRole('button', { name: 'Corregir' })).toBeNull();
      expect(within(item).queryByRole('button', { name: 'Eliminar' })).toBeNull();
    }
  });

  it('refuses a blank note before sending anything', async () => {
    open();
    await screen.findAllByRole('article');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
    expect(await screen.findByText('Escribe la nota.')).toBeInTheDocument();
    expect(calls('POST')).toEqual([]);
  });

  it('refuses a note over 5000 characters before sending anything', async () => {
    open();
    await screen.findAllByRole('article');
    const box = screen.getByLabelText('Nueva nota');
    await userEvent.click(box);
    await userEvent.paste('x'.repeat(5001));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
    expect(await screen.findByText('La nota no puede pasar de 5000 caracteres.')).toBeInTheDocument();
    expect(calls('POST')).toEqual([]);
  });

  it('sends a written note, trimmed, and clears the box', async () => {
    open('AA', { [`POST ${NOTES_PATH}`]: () => json(OWN_FRESH, 201) });
    await screen.findAllByRole('article');
    const box = screen.getByLabelText('Nueva nota');
    await userEvent.type(box, '  Llamó el cliente  ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    const [, init] = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ body: 'Llamó el cliente' });
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('says so when a month has no notes', async () => {
    open('AA', {}, NO_NOTES);
    expect(await screen.findByTestId('empty-state')).toHaveTextContent('No hay notas en este mes.');
  });

  it.each(['BM', 'SA'] as const)('%s sees no-access copy and nothing is requested', async (archetype) => {
    open(archetype);
    expect(await screen.findByText('Tu rol no consulta las notas de los expedientes.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
