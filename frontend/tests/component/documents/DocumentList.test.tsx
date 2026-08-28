/**
 * T045 (007-document-management) — calls §2's list endpoint through `QueryBoundary`;
 * empty-case renders `016a`'s existing `EmptyState`, not a bespoke one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/session/principal', () => ({
  getPrincipal: vi.fn().mockResolvedValue({ identityId: 'identity-1', memberships: [] }),
}));
vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { DocumentList } from '@/app/documents/DocumentList/DocumentList';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('DocumentList', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders every document returned for the case', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'doc-1',
              categoryId: 'cat-1',
              categoryName: 'Contrato',
              categoryStatus: 'active',
              originalFilename: 'contrato.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024,
              uploadedByMembershipId: 'm-1',
              uploadedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWithClient(<DocumentList caseId="case-1" />);

    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.getByText('Contrato')).toBeInTheDocument();
  });

  it('renders the shared EmptyState when the case has no documents', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    renderWithClient(<DocumentList caseId="case-1" />);

    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders the shared ErrorState on a failed read', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'x' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWithClient(<DocumentList caseId="case-1" />);

    expect(await screen.findByTestId('error-state')).toBeInTheDocument();
  });

  it('calls onSelect with the document id when a row is activated', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'doc-1',
              categoryId: 'cat-1',
              categoryName: 'Contrato',
              categoryStatus: 'active',
              originalFilename: 'contrato.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024,
              uploadedByMembershipId: 'm-1',
              uploadedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const onSelect = vi.fn();
    renderWithClient(<DocumentList caseId="case-1" onSelect={onSelect} />);

    const row = await screen.findByText('contrato.pdf');
    await userEvent.click(row);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('doc-1'));
  });
});
