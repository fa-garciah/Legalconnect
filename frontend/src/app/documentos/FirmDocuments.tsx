/**
 * 023 — `/documentos`, the firm's documents. FR-009 … FR-013.
 *
 * WHAT THIS SCREEN IS FOR: answering "where is the dictamen?" without first remembering which
 * matter it was filed under. `021` built the per-case view; every route and every one of its
 * API functions takes a `caseId`, so until now that question had no answer.
 *
 * Composition follows `019`'s register exactly — heading row with the primary action, filters,
 * `QueryBoundary`, a way out of an over-filtered list, "Cargar más". Two screens in the same
 * product that compose differently is a defect a user feels and a reviewer cannot see.
 *
 * THE COUNT COMES FROM THE SERVER, not from `items.length`: it describes the whole filtered
 * set under this caller's own scope (023 Decision 3), which is the only number that answers
 * "how many?". `items.length` would say 50 when there are 128.
 */
'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Plus } from 'lucide-react';
import { useInfiniteQuery, useQueries, type InfiniteData } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import { can } from '@/authz/can';
import type { Archetype } from '@/session/types';
import type { FailedResponse } from '@/lib/api-client';
import {
  listDocumentCategories,
  listFirmDocuments,
  type FirmDocumentListResponse,
  type FirmDocumentSummary,
} from '@/app/documents/api';
import { listCases } from '@/cases/api';
import {
  readViewMode,
  serverViewMode,
  subscribeViewMode,
  writeViewMode,
  type ViewMode,
} from '@/documents/view-mode';
import { PreviewPane } from '@/app/expedientes/[caseId]/documentos/PreviewPane';
import { ALL, DocumentFilters, type DocumentFilterOption } from './DocumentFilters';
import { DocumentCard } from './DocumentCard';
import { DocumentRow } from './DocumentRow';
import { ViewModeToggle } from './ViewModeToggle';
import { UploadFromFirmDialog } from './UploadFromFirmDialog';

const PAGE_SIZE = 50;
/** The two selectors are decorative: a filter list that fails must not take the page down. */
const CATALOG_STALE_MS = 5 * 60 * 1000;

export interface FirmDocumentsProps {
  readonly archetype: Archetype;
}

export function FirmDocuments({ archetype }: FirmDocumentsProps): React.JSX.Element {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState(ALL);
  const [caseId, setCaseId] = useState(ALL);
  const [selected, setSelected] = useState<FirmDocumentSummary | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  /*
   * The stored preference, read through React's own API for browser-only state. The third
   * argument is the SERVER snapshot, so the server and the first client paint agree and there
   * is neither a hydration mismatch nor a flash of the wrong layout — which a `useState` +
   * `useEffect` pair would have produced, and which lint forbids for that reason.
   */
  const mode = useSyncExternalStore(subscribeViewMode, readViewMode, serverViewMode);
  const chooseMode = useCallback((next: ViewMode) => writeViewMode(next), []);

  const [categories, cases] = useQueries({
    queries: [
      {
        queryKey: ['document-categories'],
        queryFn: listDocumentCategories,
        staleTime: CATALOG_STALE_MS,
        retry: false,
      },
      {
        queryKey: ['cases', 'for-document-filter'],
        queryFn: () => listCases({ limit: 200 }),
        staleTime: CATALOG_STALE_MS,
        retry: false,
      },
    ],
  });

  /*
   * The error type is spelled out because TypeScript cannot infer it: a rejection has no type,
   * so this would default to `Error` — and `QueryBoundary` needs the `{status, body}` shape
   * `classifyRefusal` reads. `019` records the same note for the same reason.
   */
  const query = useInfiniteQuery<
    FirmDocumentListResponse,
    FailedResponse | null,
    InfiniteData<FirmDocumentListResponse, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    // The filters are in the key, which is what makes changing one reset the cursor.
    queryKey: ['firm-documents', q.trim(), categoryId, caseId],
    queryFn: ({ pageParam }) =>
      listFirmDocuments({
        q: q.trim() || undefined,
        categoryId: categoryId === ALL ? undefined : categoryId,
        caseId: caseId === ALL ? undefined : caseId,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: FirmDocumentListResponse) => last.nextCursor ?? undefined,
  });

  const categoryOptions: readonly DocumentFilterOption[] = useMemo(
    () =>
      (categories.data?.items ?? []).map((category) => ({
        id: category.id,
        // A retired category stays offered while documents remain filed under it — otherwise
        // those documents cannot be found at all (021/FR-012's reasoning).
        label: category.status === 'retired' ? `${category.name} (Retirada)` : category.name,
      })),
    [categories.data],
  );

  const caseOptions: readonly DocumentFilterOption[] = useMemo(
    () => (cases.data?.items ?? []).map((item) => ({ id: item.id, label: item.fileNumber })),
    [cases.data],
  );

  const hasFilter = q.trim().length > 0 || categoryId !== ALL || caseId !== ALL;
  const total = query.data?.pages[0]?.total ?? 0;
  /** There is a count only once the server has given one — never a placeholder zero. */
  const hasCount = query.data !== undefined;
  const items = (query.data?.pages ?? []).flatMap((page) => page.items);
  const showClear = query.status === 'success' && items.length === 0 && hasFilter;

  function clearFilters(): void {
    setQ('');
    setCategoryId(ALL);
    setCaseId(ALL);
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="documentos-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="documentos-heading" className="font-display text-display font-semibold tracking-tight">
          Documentos
        </h1>
        {can('document.upload', archetype) ? (
          <Button onClick={() => setUploadOpen(true)}>
            <Plus aria-hidden className="mr-2 h-4 w-4" />
            Subir documento
          </Button>
        ) : null}
      </div>

      <DocumentFilters
        q={q}
        categoryId={categoryId}
        caseId={caseId}
        onQChange={setQ}
        onCategoryChange={setCategoryId}
        onCaseChange={setCaseId}
        categories={categoryOptions}
        cases={caseOptions}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          RENDERED ONLY ONCE THERE IS AN ANSWER. While the query is in flight there is no
          count, and printing "0 documentos" in the meantime is not a neutral placeholder —
          it is a confident wrong answer, and the one a person is most likely to believe
          about a firm they have just opened. Caught by the e2e spec, which read the 0 during
          loading and then compared it against a filtered count.
        */}
        {hasCount ? (
          <p className="text-small text-muted-foreground" data-testid="document-count">
            {total === 1 ? '1 documento' : `${total} documentos`}
          </p>
        ) : (
          <span />
        )}
        <ViewModeToggle mode={mode} onChange={chooseMode} />
      </div>

      <QueryBoundary
        query={query}
        isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
        emptyGuidance={
          hasFilter
            ? 'Ningún documento coincide con los filtros actuales.'
            : 'Cuando el despacho suba documentos a sus expedientes, aparecerán aquí.'
        }
      >
        {(data) => {
          const rows = data.pages.flatMap((page) => page.items);
          return mode === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((item) => (
                <DocumentCard
                  key={item.id}
                  item={item}
                  archetype={archetype}
                  onPreview={setSelected}
                />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Expediente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tamaño</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <DocumentRow
                    key={item.id}
                    item={item}
                    archetype={archetype}
                    onPreview={setSelected}
                  />
                ))}
              </TableBody>
            </Table>
          );
        }}
      </QueryBoundary>

      {showClear ? (
        <div>
          <Button variant="secondary" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
      ) : null}

      {query.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            Cargar más
          </Button>
        </div>
      ) : null}

      {selected ? (
        // `021`'s pane, unchanged, driven by the selected row's OWN case id.
        <PreviewPane
          caseId={selected.caseId}
          document={selected}
          mayDownload={can('document.download', archetype)}
        />
      ) : null}

      {/*
        Rendered only while open, so closing it DISCARDS the matter that was chosen rather
        than leaving it to be cleared. An upload targets one matter, and a remembered one is
        how a document lands on the wrong file.
      */}
      {uploadOpen ? (
        <UploadFromFirmDialog
          open
          cases={cases.data?.items ?? []}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            void query.refetch();
          }}
        />
      ) : null}
    </section>
  );
}
