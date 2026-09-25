/**
 * T021 — uploading from the firm-wide page. 023/FR-012, Decision 7.
 *
 * THE MATTER IS ASKED FOR FIRST, and that is the requirement rather than a layout preference:
 * `POST /tenant/cases/:caseId/documents` cannot be called without a case, and
 * `document.upload` is `assigned`-scoped, so the case must be chosen AND reachable. Feeding
 * the selector from the already-`assigned`-scoped case list is what makes an unreachable
 * matter un-offerable rather than offered-then-refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { UploadFromFirmDialog } from '@/app/documentos/UploadFromFirmDialog';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CATEGORIES } from './fixtures';

const CASES = [
  { id: 'case-a', fileNumber: 'EXP-2026-2001' },
  { id: 'case-b', fileNumber: 'EXP-2026-2002' },
];

describe('UploadFromFirmDialog', () => {
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function mount(cases = CASES, onUploaded = vi.fn()) {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/document-categories': () => json(CATEGORIES),
        'POST /tenant/cases/case-b/documents': () =>
          json({ id: 'doc-new', caseId: 'case-b', categoryId: 'cat-default', categoryName: 'Sin clasificar' }, 201),
      }),
    );
    return { onUploaded, ...renderWithClient(
      <UploadFromFirmDialog open cases={cases} onClose={vi.fn()} onUploaded={onUploaded} />,
    ) };
  }

  it('asks for the matter first, and offers no file picker yet', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: /subir documento/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Expediente')).toBeInTheDocument();
    // The file input belongs to 021's dialog, which has not been reached yet.
    expect(screen.queryByLabelText(/archivo/i)).not.toBeInTheDocument();
  });

  it('offers only the matters it was given — the assigned-scoped list', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByLabelText('Expediente'));
    expect(await screen.findByRole('option', { name: 'EXP-2026-2001' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'EXP-2026-2002' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /EXP-2026-9999/ })).not.toBeInTheDocument();
  });

  it('hands over to 021\'s upload dialog once a matter is chosen', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByLabelText('Expediente'));
    await user.click(await screen.findByRole('option', { name: 'EXP-2026-2002' }));

    // 021's dialog reads the category catalog on open — the observable proof we handed over
    // rather than reimplementing the form.
    await waitFor(() => {
      const paths = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(paths.some((p) => p.includes('/tenant/document-categories'))).toBe(true);
    });
    // Its file input and its category selector, by their own labels. Asserted on the controls
    // rather than on the text "Sin clasificar", which 021 renders in both the trigger and the
    // option list — two matches, and a failure that says nothing about the handover.
    expect(await screen.findByLabelText('Archivo')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument();
  });

  it('says so plainly when there is no matter to upload to', async () => {
    // An AA with no live assignment holds `document.upload` and can reach nothing with it.
    // A silent empty select would read as a broken screen.
    mount([]);
    expect(
      await screen.findByText('No tienes expedientes asignados a los que puedas subir documentos.'),
    ).toBeInTheDocument();
  });

  it('renders nothing at all when closed', () => {
    renderWithClient(
      <UploadFromFirmDialog open={false} cases={CASES} onClose={vi.fn()} onUploaded={vi.fn()} />,
    );
    expect(screen.queryByRole('heading', { name: /subir documento/i })).not.toBeInTheDocument();
  });
});
