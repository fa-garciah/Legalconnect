/**
 * 021 T023 (US3). Re-filing a document under another category (row 39: MP, CM, SA).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { ChangeCategoryControl } from '@/app/expedientes/[caseId]/documentos/ChangeCategoryDialog';
import type { DocumentSummary } from '@/app/documents/api';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASE_ID, CATEGORIES, PDF } from './fixtures';

const DOC = PDF as unknown as DocumentSummary;

describe('ChangeCategoryControl', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['MP', 'CM', 'SA'] as const)('is drawn for %s', (archetype) => {
    renderWithClient(<ChangeCategoryControl archetype={archetype} caseId={CASE_ID} document={DOC} />);
    expect(screen.getByRole('button', { name: /cambiar categoría/i })).toBeInTheDocument();
  });

  it.each(['AA', 'PL', 'BM'] as const)('is not drawn for %s', (archetype) => {
    renderWithClient(<ChangeCategoryControl archetype={archetype} caseId={CASE_ID} document={DOC} />);
    expect(screen.queryByRole('button', { name: /cambiar categoría/i })).not.toBeInTheDocument();
  });

  it('offers active categories other than the current one, and saves the choice', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/document-categories': () => json(CATEGORIES),
        [`PATCH /tenant/cases/${CASE_ID}/documents/doc-pdf/category`]: () =>
          json({ id: 'doc-pdf', categoryId: 'cat-default', categoryName: 'Sin clasificar' }),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<ChangeCategoryControl archetype="CM" caseId={CASE_ID} document={DOC} />);
    await user.click(screen.getByRole('button', { name: /cambiar categoría/i }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText(/nueva categoría/i);
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Sin clasificar' })).toBeInTheDocument());
    expect(within(select).queryByRole('option', { name: 'Contrato' })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Borrador antiguo' })).not.toBeInTheDocument();

    await user.selectOptions(select, 'cat-default');
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(JSON.parse(call![1].body as string)).toEqual({ categoryId: 'cat-default' });
    });
  });

  it('a 422 says the category is gone and re-reads the catalog', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/document-categories': () => json(CATEGORIES),
        [`PATCH /tenant/cases/${CASE_ID}/documents/doc-pdf/category`]: () =>
          json({ error: { code: 'catalog_entry_not_available', message: 'x' } }, 422),
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<ChangeCategoryControl archetype="MP" caseId={CASE_ID} document={DOC} />);
    await user.click(screen.getByRole('button', { name: /cambiar categoría/i }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText(/nueva categoría/i);
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Sin clasificar' })).toBeInTheDocument());
    await user.selectOptions(select, 'cat-default');
    await user.click(within(dialog).getByRole('button', { name: /guardar/i }));
    expect(await within(dialog).findByText(/ya no está disponible/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('document-categories')).length).toBeGreaterThan(1),
    );
  });
});
