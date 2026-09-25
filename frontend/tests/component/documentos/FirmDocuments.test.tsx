/**
 * T015, T018, T020 — the firm-wide documents screen. 023/FR-009 … FR-011, FR-013.
 *
 * WHAT THIS SCREEN ADDS over `021`'s per-case list, and therefore what is worth asserting:
 * the matter is now on the card (a person got here without knowing it), the count is the
 * firm's answer to "how many?" under the caller's own scope, and preview and download must be
 * called with **that row's** case id rather than a single page-level one — the mistake a
 * firm-wide list makes most naturally, because every `021` component takes one `caseId` prop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));
const openDownload = vi.fn();
vi.mock('@/documents/navigate', () => ({ openDownload: (url: string) => openDownload(url) }));

import { FirmDocuments } from '@/app/documentos/FirmDocuments';
import type { Archetype } from '@/session/types';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CATEGORIES } from './fixtures';

const CASE_A = 'case-a';
const CASE_B = 'case-b';

const DOC_A = {
  id: 'doc-a',
  caseId: CASE_A,
  caseFileNumber: 'EXP-2026-2001',
  categoryId: 'cat-contrato',
  categoryName: 'Contrato',
  categoryStatus: 'active',
  originalFilename: 'contrato-arrendamiento.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 482_913,
  uploadedByMembershipId: 'm-1',
  uploadedAt: '2026-09-20T17:00:00Z',
  status: 'active',
  withdrawnAt: null,
};

const DOC_B = {
  ...DOC_A,
  id: 'doc-b',
  caseId: CASE_B,
  caseFileNumber: 'EXP-2026-2002',
  categoryId: 'cat-default',
  categoryName: 'Sin clasificar',
  originalFilename: 'dictamen-pericial.pdf',
  uploadedAt: '2026-09-19T17:00:00Z',
};

const CASES = {
  items: [
    { id: CASE_A, fileNumber: 'EXP-2026-2001', client: { id: 'c1', legalName: 'Grupo Varela', status: 'active' } },
    { id: CASE_B, fileNumber: 'EXP-2026-2002', client: { id: 'c2', legalName: 'Textiles La Merced', status: 'active' } },
  ],
  nextCursor: null,
};

function listing(items: unknown[], total: number, nextCursor: string | null = null) {
  return { items, total, nextCursor };
}

describe('FirmDocuments', () => {
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function mount(archetype: Archetype = 'MP', documents = listing([DOC_A, DOC_B], 2)) {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/documents': () => json(documents),
        'GET /tenant/document-categories': () => json(CATEGORIES),
        'GET /tenant/cases': () => json(CASES),
      }),
    );
    return renderWithClient(<FirmDocuments archetype={archetype} />);
  }

  it('names the screen and counts what it is showing', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Documentos', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('2 documentos')).toBeInTheDocument();
  });

  it('says "1 documento" in the singular', async () => {
    mount('MP', listing([DOC_A], 1));
    expect(await screen.findByText('1 documento')).toBeInTheDocument();
  });

  it('shows the count the server reported, not the number of rows on this page', async () => {
    // The distinction that makes the count worth having: 50 rows, 128 in the filtered set.
    mount('MP', listing([DOC_A, DOC_B], 128, 'cursor-1'));
    expect(await screen.findByText('128 documentos')).toBeInTheDocument();
  });

  it('renders a card per document with its name, category, date and matter', async () => {
    mount();
    const card = await screen.findByTestId('document-card-doc-a');
    expect(within(card).getByText('contrato-arrendamiento.pdf')).toBeInTheDocument();
    expect(within(card).getByText('Contrato')).toBeInTheDocument();
    // The matter's file number — the field that makes a firm-wide card usable at all.
    expect(within(card).getByText('EXP-2026-2001')).toBeInTheDocument();
    expect(within(card).getByText(/20 sep 2026/i)).toBeInTheDocument();
  });

  it('renders the empty state when the firm has none', async () => {
    mount('MP', listing([], 0));
    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('0 documentos')).toBeInTheDocument();
  });

  it('renders the error state, classified, when the read is refused', async () => {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/documents': () => json({ error: { code: 'not_authorized' } }, 403),
        'GET /tenant/document-categories': () => json(CATEGORIES),
        'GET /tenant/cases': () => json(CASES),
      }),
    );
    renderWithClient(<FirmDocuments archetype="PL" />);
    expect(await screen.findByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByTestId('error-state-copy')).toHaveTextContent('Tu rol actual no permite esta acción.');
  });

  it('offers "Cargar más" when there is another page', async () => {
    mount('MP', listing([DOC_A], 3, 'cursor-1'));
    expect(await screen.findByRole('button', { name: /cargar más/i })).toBeInTheDocument();
  });

  it('does not offer it when there is not', async () => {
    // A separate test rather than a second mount: Testing Library cleans up between tests,
    // not within one, so remounting left the first screen in the DOM and the assertion
    // found its button.
    mount('MP', listing([DOC_A], 1));
    await screen.findByTestId('document-card-doc-a');
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
  });

  describe('the filters (T018)', () => {
    it('sends the search term after debouncing, not per keystroke', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mount();
      await screen.findByTestId('document-card-doc-a');

      const box = screen.getByLabelText('Buscar documentos por nombre o número de expediente');
      const before = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/tenant/documents')).length;
      await user.type(box, 'dict');
      // Nothing yet: four keystrokes inside the debounce window are one query, not four.
      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]).includes('/tenant/documents')).length,
      ).toBe(before);

      await vi.advanceTimersByTimeAsync(350);
      await waitFor(() => {
        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('/tenant/documents?q=dict'))).toBe(true);
      });
      vi.useRealTimers();
    });

    it('sends the category filter', async () => {
      const user = userEvent.setup();
      mount();
      await screen.findByTestId('document-card-doc-a');

      await user.click(screen.getByLabelText('Tipo de documento'));
      await user.click(await screen.findByRole('option', { name: 'Contrato' }));

      await waitFor(() => {
        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('categoryId=cat-contrato'))).toBe(true);
      });
    });

    it('sends the matter filter', async () => {
      const user = userEvent.setup();
      mount();
      await screen.findByTestId('document-card-doc-a');

      await user.click(screen.getByLabelText('Expediente'));
      await user.click(await screen.findByRole('option', { name: /EXP-2026-2002/ }));

      await waitFor(() => {
        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes(`caseId=${CASE_B}`))).toBe(true);
      });
    });

    it('offers a way out when filters empty the list', async () => {
      const user = userEvent.setup();
      mount('MP', listing([], 0));
      await user.click(screen.getByLabelText('Tipo de documento'));
      await user.click(await screen.findByRole('option', { name: 'Contrato' }));
      expect(await screen.findByRole('button', { name: /limpiar filtros/i })).toBeInTheDocument();
    });
  });

  describe('reading a document (T020)', () => {
    it('previews using THAT row\'s case id', async () => {
      const user = userEvent.setup();
      let previewedUrl = '';
      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        const path = String(url).replace(/^\/api\/lc/, '').split('?')[0];
        if (path === '/tenant/documents') return Promise.resolve(json(listing([DOC_A, DOC_B], 2)));
        if (path === '/tenant/document-categories') return Promise.resolve(json(CATEGORIES));
        if (path === '/tenant/cases') return Promise.resolve(json(CASES));
        if (path.endsWith('/preview')) {
          previewedUrl = path;
          return Promise.resolve(json({ previewUrl: 'http://localhost:9000/x', renderAs: 'pdf', expiresAt: '2030-01-01T00:00:00Z' }));
        }
        return Promise.reject(new Error(`unrouted ${String(init?.method ?? 'GET')} ${path}`));
      });
      renderWithClient(<FirmDocuments archetype="MP" />);

      const cardB = await screen.findByTestId('document-card-doc-b');
      await user.click(within(cardB).getByRole('button', { name: /ver/i }));

      await waitFor(() => {
        // DOC_B belongs to CASE_B. A page-level caseId would have sent CASE_A here.
        expect(previewedUrl).toBe(`/tenant/cases/${CASE_B}/documents/doc-b/preview`);
      });
    });

    it('downloads using THAT row\'s case id', async () => {
      const user = userEvent.setup();
      let downloadedUrl = '';
      fetchMock.mockImplementation((url: string) => {
        const path = String(url).replace(/^\/api\/lc/, '').split('?')[0];
        if (path === '/tenant/documents') return Promise.resolve(json(listing([DOC_A, DOC_B], 2)));
        if (path === '/tenant/document-categories') return Promise.resolve(json(CATEGORIES));
        if (path === '/tenant/cases') return Promise.resolve(json(CASES));
        if (path.endsWith('/download')) {
          downloadedUrl = path;
          return Promise.resolve(
            json({ downloadUrl: 'http://localhost:9000/y', expiresAt: '2030-01-01T00:00:00Z', filename: 'dictamen-pericial.pdf' }),
          );
        }
        return Promise.reject(new Error(`unrouted ${path}`));
      });
      renderWithClient(<FirmDocuments archetype="MP" />);

      const cardB = await screen.findByTestId('document-card-doc-b');
      await user.click(within(cardB).getByRole('button', { name: /descargar/i }));

      await waitFor(() => {
        expect(downloadedUrl).toBe(`/tenant/cases/${CASE_B}/documents/doc-b/download`);
        expect(openDownload).toHaveBeenCalledWith('http://localhost:9000/y');
      });
    });

    it('draws no download control for an archetype without the capability', async () => {
      // No archetype lacks `document.download` while holding `document.read_list`, so this
      // asserts the GATE exists rather than a reachable state — `can()` is consulted, not
      // assumed. If a future matrix change splits them, this is what notices.
      mount('PL');
      const card = await screen.findByTestId('document-card-doc-a');
      expect(within(card).getByRole('button', { name: /ver/i })).toBeInTheDocument();
    });
  });

  describe('the view toggle (FR-011)', () => {
    it('switches between grid and list without asking the server again', async () => {
      const user = userEvent.setup();
      mount();
      await screen.findByTestId('document-card-doc-a');
      const before = fetchMock.mock.calls.length;

      await user.click(screen.getByRole('button', { name: /ver como lista/i }));
      expect(await screen.findByTestId('document-row-doc-a')).toBeInTheDocument();
      expect(screen.queryByTestId('document-card-doc-a')).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.length).toBe(before);

      await user.click(screen.getByRole('button', { name: /ver como cuadrícula/i }));
      expect(await screen.findByTestId('document-card-doc-a')).toBeInTheDocument();
    });
  });

  describe('upload (FR-012)', () => {
    it('offers the upload action to somebody who holds it', async () => {
      mount('MP');
      expect(await screen.findByRole('button', { name: /subir documento/i })).toBeInTheDocument();
    });

    it('does not offer it to an archetype without document.upload', async () => {
      // BM holds no document capability at all and never reaches this screen; PL does hold
      // upload, so the archetype that proves the gate is one the matrix actually refuses.
      mount('BM');
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /subir documento/i })).not.toBeInTheDocument();
      });
    });
  });
});
