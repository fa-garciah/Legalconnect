/**
 * 008 T020 (US5). A matter's activity: one Spanish sentence per change, by position, one month at a
 * time, and an honest notice when the month had more than the feed lists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { ActivityView } from '@/app/expedientes/[caseId]/actividad/ActivityView';
import type { Archetype } from '@/session/types';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASE_ID, EMPTY_FEED, FEED, MONTH } from '../notas/fixtures';

const PATH = `/tenant/cases/${CASE_ID}/activity`;

describe('ActivityView', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(archetype: Archetype = 'AA', feed = FEED) {
    fetchMock.mockImplementation(route({ [`GET ${PATH}`]: () => json(feed) }));
    return renderWithClient(<ActivityView caseId={CASE_ID} archetype={archetype} month={MONTH} />);
  }

  const urls = () => fetchMock.mock.calls.map(([url]) => String(url));

  it('writes one sentence per change, by position, newest first', async () => {
    open();
    const items = await screen.findAllByRole('listitem');
    expect(items.map((i) => i.querySelector('p')?.textContent)).toEqual([
      'Asociado agregó una nota',
      'Pasante subió el documento «Demanda inicial.pdf»',
      'Socio cambió el estado del expediente',
    ]);
  });

  it('asks for the month shown; the month selector asks for another', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Octubre de 2026', level: 2 })).toBeInTheDocument();
    expect(urls()[0]).toContain('month=2026-10');
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    await waitFor(() => expect(urls().some((u) => u.includes('month=2026-09'))).toBe(true));
  });

  it('says so when a month had no changes', async () => {
    open('AA', EMPTY_FEED);
    expect(await screen.findByTestId('empty-state')).toHaveTextContent('No hubo cambios en este expediente en este mes.');
  });

  it('says so when the month had more than the feed lists', async () => {
    open('AA', { ...FEED, truncated: true });
    expect(await screen.findByText('Se muestran los 200 cambios más recientes de este mes.')).toBeInTheDocument();
  });

  it('the administrator reads it', async () => {
    open('SA');
    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
  });

  it('BM sees no-access copy and nothing is requested', async () => {
    open('BM');
    expect(await screen.findByText('Tu rol no consulta la actividad de los expedientes.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
