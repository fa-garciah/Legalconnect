/** 021 FR-001. The case panel leads to the case's documents page. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { CaseDetailPanel } from '@/app/expedientes/CaseDetailPanel';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASE_ID } from './fixtures';

const CASE = {
  id: CASE_ID,
  fileNumber: 'EXP-2026-0042',
  client: { id: 'cl1', legalName: 'Grupo Torres, S.A. de C.V.', status: 'active' },
  status: { id: 's1', name: 'En proceso', isClosing: false, catalogStatus: 'active' },
  matterType: null,
  venue: null,
  venueCaseReference: null,
  openedOn: '2026-09-01',
  closedOn: null,
  team: [],
};

describe('the case panel links to its documents', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'fetch',
      vi.fn(route({ [`GET /tenant/cases/${CASE_ID}`]: () => json(CASE), 'GET /tenant/case-statuses': () => json({ items: [] }) })),
    ),
  );
  afterEach(() => vi.unstubAllGlobals());

  it('offers "Documentos del expediente" pointing at /expedientes/{id}/documentos', async () => {
    renderWithClient(<CaseDetailPanel open caseId={CASE_ID} archetype="AA" onClose={() => {}} />);
    const link = await screen.findByRole('link', { name: /documentos del expediente/i });
    expect(link).toHaveAttribute('href', `/expedientes/${CASE_ID}/documentos`);
  });
});
