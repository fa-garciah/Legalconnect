/**
 * 021 T018 (US1). Attaching a file to a matter.
 *
 * The file is checked before it is sent (type and 25 MB, mirroring 007 and Decision 4). The
 * request is `multipart/form-data` with `file` and, when chosen, `categoryId`. Every refusal the
 * server can give reads in Spanish; `007`'s English `message` never reaches the screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { UploadDialog } from '@/app/expedientes/[caseId]/documentos/UploadDialog';
import { json, renderWithClient, route } from '../configuracion/helpers';
import { CASE_ID, CATEGORIES, PDF } from './fixtures';

function fileOf(name: string, type: string, size = 64): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('UploadDialog', () => {
  const fetchMock = vi.fn();
  const onUploaded = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function open(upload: () => Response = () => json(PDF, 201)) {
    fetchMock.mockImplementation(
      route({
        'GET /tenant/document-categories': () => json(CATEGORIES),
        [`POST /tenant/cases/${CASE_ID}/documents`]: upload,
      }),
    );
    return renderWithClient(<UploadDialog open caseId={CASE_ID} onClose={() => {}} onUploaded={onUploaded} />);
  }

  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

  it('offers active categories only, plus "Sin categoría"', async () => {
    open();
    const select = screen.getByLabelText(/^categoría/i);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Contrato' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'Borrador antiguo' })).not.toBeInTheDocument();
    expect(select).toHaveValue('');
  });

  it('sends FormData with the file and the chosen category', async () => {
    const user = userEvent.setup();
    open();
    await user.upload(screen.getByLabelText(/^archivo/i), fileOf('contrato.pdf', 'application/pdf'));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Contrato' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/^categoría/i), 'cat-contrato');
    await user.click(screen.getByRole('button', { name: /subir documento/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    const body = posts()[0]![1].body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('contrato.pdf');
    expect(body.get('categoryId')).toBe('cat-contrato');
  });

  it('omits categoryId when none is chosen, so the firm default applies', async () => {
    const user = userEvent.setup();
    open();
    await user.upload(screen.getByLabelText(/^archivo/i), fileOf('contrato.pdf', 'application/pdf'));
    await user.click(screen.getByRole('button', { name: /subir documento/i }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0]![1].body as FormData).has('categoryId')).toBe(false);
  });

  it('refuses a disallowed type before sending, naming what is accepted', async () => {
    const user = userEvent.setup({ applyAccept: false });
    open();
    await user.upload(screen.getByLabelText(/^archivo/i), fileOf('respaldo.zip', 'application/zip'));
    await user.click(screen.getByRole('button', { name: /subir documento/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se admite.*pdf/i);
    expect(posts()).toHaveLength(0);
  });

  it('refuses a file over 25 MB before sending', async () => {
    const user = userEvent.setup();
    open();
    await user.upload(screen.getByLabelText(/^archivo/i), fileOf('grande.pdf', 'application/pdf', 26 * 1024 * 1024));
    await user.click(screen.getByRole('button', { name: /subir documento/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pasa de 25 MB/);
    expect(posts()).toHaveLength(0);
  });

  it.each([
    ['403 limit_reached', 403, { error: { code: 'limit_reached', message: "Your plan's limit" }, limit: { key: 'storage_bytes', value: 1 } }, /límite de tu plan/i],
    ['413 file_too_large', 413, { error: { code: 'file_too_large', message: 'The file is larger' } }, /pasa de 25 MB/],
    ['400 validation_failed', 400, { error: { code: 'validation_failed', message: 'This file type is not allowed.' } }, /no se admite/i],
    ['404 not_found', 404, { error: { code: 'not_found', message: 'Not found' } }, /no se pudo completar/i],
  ])('a server %s reads in Spanish, never the server message', async (_label, status, body, copy) => {
    const user = userEvent.setup();
    open(() => json(body, status));
    await user.upload(screen.getByLabelText(/^archivo/i), fileOf('contrato.pdf', 'application/pdf'));
    await user.click(screen.getByRole('button', { name: /subir documento/i }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByText(/not allowed|larger|limit for this|Not found/)).not.toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
