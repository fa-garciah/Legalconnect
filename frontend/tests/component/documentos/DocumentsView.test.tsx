/**
 * 021 T020, T021, T024 (US2, US3). A matter's documents: the list, the preview, download,
 * withdraw and restore.
 *
 * Preview and download are each ONE audited access (007/FR-020), so neither is fetched until the
 * person asks — never pre-fetched per row. A case the caller cannot reach reads exactly like one
 * that does not exist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));
const openDownload = vi.fn();
vi.mock('@/documents/navigate', () => ({ openDownload: (url: string) => openDownload(url) }));

import { DocumentsView } from '@/app/expedientes/[caseId]/documentos/DocumentsView';
import type { Archetype } from '@/session/types';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASE_ID, CATEGORIES, DOCX, PDF, WITHDRAWN } from './fixtures';

const CASE = {
  id: CASE_ID,
  fileNumber: 'EXP-2026-0042',
  client: { id: 'cl1', legalName: 'Grupo Torres, S.A. de C.V.', status: 'active' },
  status: { id: 's1', name: 'En proceso', isClosing: false, catalogStatus: 'active' },
  matterType: null,
  venue: null,
  openedOn: '2026-09-01',
  closedOn: null,
  team: [],
};

describe('DocumentsView', () => {
  const fetchMock = vi.fn();
  const base = `/tenant/cases/${CASE_ID}`;

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(archetype: Archetype = 'MP', extra: Record<string, () => Response> = {}) {
    fetchMock.mockImplementation(
      route({
        [`GET ${base}`]: () => json(CASE),
        [`GET ${base}/documents`]: () => json({ items: [DOCX, PDF] }),
        [`GET ${base}/documents/withdrawn`]: () => json({ items: [WITHDRAWN] }),
        'GET /tenant/document-categories': () => json(CATEGORIES),
        ...extra,
      }),
    );
    return renderWithClient(<DocumentsView caseId={CASE_ID} archetype={archetype} />);
  }

  const calls = (suffix: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(suffix));
  const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

  it('names the case it belongs to', async () => {
    open();
    expect(await screen.findByRole('heading', { name: /EXP-2026-0042/ })).toBeInTheDocument();
    expect(screen.getByText('Grupo Torres, S.A. de C.V.')).toBeInTheDocument();
  });

  it('lists name, category (retired marked), size and date, newest first', async () => {
    open();
    const rows = await screen.findAllByRole('row');
    const names = rows.map((r) => r.textContent ?? '');
    expect(names.findIndex((t) => t.includes('demanda.docx'))).toBeLessThan(
      names.findIndex((t) => t.includes('contrato-arrendamiento.pdf')),
    );
    const docx = await rowOf('demanda.docx');
    expect(within(docx).getByText('Borrador antiguo')).toBeInTheDocument();
    expect(within(docx).getByText(/retirada/i)).toBeInTheDocument();
    expect(within(docx).getByText('1.2 MB')).toBeInTheDocument();
    expect(within(await rowOf('contrato-arrendamiento.pdf')).getByText('472 KB')).toBeInTheDocument();
  });

  it('says so when the case has no documents', async () => {
    open('MP', { [`GET ${base}/documents`]: () => json({ items: [] }) });
    expect(await screen.findByText(/este expediente aún no tiene documentos/i)).toBeInTheDocument();
  });

  it('a case the caller cannot reach reads like one that does not exist', async () => {
    open('AA', {
      [`GET ${base}`]: () => json({ error: { code: 'not_found', message: 'Not found' } }, 404),
      [`GET ${base}/documents`]: () => json({ error: { code: 'not_found', message: 'Not found' } }, 404),
    });
    expect(await screen.findByText(/no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/permiso|not found/i)).not.toBeInTheDocument();
  });

  it('fetches no preview and no download until asked', async () => {
    open();
    await rowOf('contrato-arrendamiento.pdf');
    expect(calls('/preview')).toHaveLength(0);
    expect(calls('/download')).toHaveLength(0);
  });

  it('"Ver" on a PDF renders it inline, titled with its name', async () => {
    const user = userEvent.setup();
    open('MP', {
      [`GET ${base}/documents/doc-pdf/preview`]: () =>
        json({ previewUrl: 'http://store/doc.pdf?sig', expiresAt: '2099-01-01T00:00:00Z', renderAs: 'pdf' }),
    });
    await user.click(within(await rowOf('contrato-arrendamiento.pdf')).getByRole('button', { name: /^ver/i }));
    const frame = await screen.findByTitle(/vista previa de contrato-arrendamiento\.pdf/i);
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'http://store/doc.pdf?sig');
    expect(calls('/preview')).toHaveLength(1);
  });

  it('an image renders as an img with the file name as its text alternative', async () => {
    const user = userEvent.setup();
    const IMG = { ...PDF, id: 'doc-img', originalFilename: 'foto.png', mimeType: 'image/png' };
    open('MP', {
      [`GET ${base}/documents`]: () => json({ items: [IMG] }),
      [`GET ${base}/documents/doc-img/preview`]: () =>
        json({ previewUrl: 'http://store/foto.png?sig', expiresAt: '2099-01-01T00:00:00Z', renderAs: 'image' }),
    });
    await user.click(within(await rowOf('foto.png')).getByRole('button', { name: /^ver/i }));
    expect(await screen.findByRole('img', { name: 'foto.png' })).toHaveAttribute('src', 'http://store/foto.png?sig');
  });

  it.each(['converted-pdf', 'unsupported'])('%s shows "no disponible" with a download', async (renderAs) => {
    const user = userEvent.setup();
    open('MP', {
      [`GET ${base}/documents/doc-docx/preview`]: () =>
        json({ previewUrl: renderAs === 'unsupported' ? null : 'http://store/x.docx', renderAs, downloadAvailable: true }),
    });
    await user.click(within(await rowOf('demanda.docx')).getByRole('button', { name: /^ver/i }));
    const pane = await screen.findByRole('region', { name: /vista previa/i });
    expect(within(pane).getByText(/no se puede previsualizar/i)).toBeInTheDocument();
    expect(within(pane).queryByTitle(/vista previa de/i)).not.toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: /descargar/i })).toBeInTheDocument();
  });

  it('"Descargar" asks for a URL only on click and navigates to it', async () => {
    const user = userEvent.setup();
    open('MP', {
      [`GET ${base}/documents/doc-pdf/download`]: () =>
        json({ downloadUrl: 'http://store/doc.pdf?dl', expiresAt: 'x', filename: 'contrato-arrendamiento.pdf' }),
    });
    await user.click(within(await rowOf('contrato-arrendamiento.pdf')).getByRole('button', { name: /descargar/i }));
    await waitFor(() => expect(openDownload).toHaveBeenCalledWith('http://store/doc.pdf?dl'));
    expect(calls('/download')).toHaveLength(1);
  });

  it('signed URLs never reach browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    open('MP', {
      [`GET ${base}/documents/doc-pdf/preview`]: () =>
        json({ previewUrl: 'http://store/doc.pdf?sig', expiresAt: '2099-01-01T00:00:00Z', renderAs: 'pdf' }),
    });
    await user.click(within(await rowOf('contrato-arrendamiento.pdf')).getByRole('button', { name: /^ver/i }));
    await screen.findByTitle(/vista previa de/i);
    for (const call of setItem.mock.calls) expect(String(call[1])).not.toContain('store/');
    setItem.mockRestore();
  });

  it.each<[Archetype, boolean]>([
    ['AA', true],
    ['PL', true],
    ['BM', false],
  ])('%s — the upload control is drawn: %s', async (archetype, drawn) => {
    open(archetype);
    await screen.findByRole('heading', { name: /EXP-2026-0042/ });
    expect(Boolean(screen.queryByRole('button', { name: /subir documento/i }))).toBe(drawn);
  });

  it('"Retirar" is for MP and SA only, and confirms first, saying nothing is deleted', async () => {
    const user = userEvent.setup();
    open('MP', {
      [`PATCH ${base}/documents/doc-pdf/withdraw`]: () => json({ ...PDF, status: 'withdrawn' }),
    });
    await user.click(within(await rowOf('contrato-arrendamiento.pdf')).getByRole('button', { name: /^retirar/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/no se borra/i);
    expect(calls('/withdraw')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: /retirar documento/i }));
    await waitFor(() => expect(calls('/withdraw')).toHaveLength(1));
  });

  it('an AA gets no "Retirar" and no "Retirados"', async () => {
    open('AA');
    const row = await rowOf('contrato-arrendamiento.pdf');
    expect(within(row).queryByRole('button', { name: /^retirar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /retirados/i })).not.toBeInTheDocument();
  });

  it('"Retirados" lists withdrawn documents; "Restaurar" needs no confirmation', async () => {
    const user = userEvent.setup();
    open('SA', {
      [`PATCH ${base}/documents/doc-old/restore`]: () => json({ ...WITHDRAWN, status: 'active' }),
    });
    await user.click(await screen.findByRole('tab', { name: /retirados/i }));
    const row = await rowOf('borrador-equivocado.pdf');
    await user.click(within(row).getByRole('button', { name: /restaurar/i }));
    await waitFor(() => expect(calls('/restore')).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('a 409 on restore says a colleague already did it, and re-reads', async () => {
    const user = userEvent.setup();
    open('SA', {
      [`PATCH ${base}/documents/doc-old/restore`]: () =>
        json({ error: { code: 'not_withdrawn', message: 'The document is not withdrawn.' } }, 409),
    });
    await user.click(await screen.findByRole('tab', { name: /retirados/i }));
    await user.click(within(await rowOf('borrador-equivocado.pdf')).getByRole('button', { name: /restaurar/i }));
    expect(await screen.findByText(/otra persona ya restauró/i)).toBeInTheDocument();
    await waitFor(() => expect(calls('/documents/withdrawn').length).toBeGreaterThan(1));
  });
});
