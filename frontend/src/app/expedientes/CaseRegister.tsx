/**
 * T028 — the case register (019/US1).
 *
 * **This screen renders what `006` returned and does not second-guess it.** `006` applies
 * `q`, the matter type and the venue inside the query, before the page boundary, and bounds
 * the result set by assignment in the same `WHERE`. So a page of 50 is 50 matching matters
 * the caller may see, and `nextCursor` means the next page of those. Filtering again here
 * would shorten pages while "Cargar más" still promised more, dropping rows the server sent
 * on purpose (FR-003). There is no `.filter()` below, and that absence is the point.
 *
 * **Three empty states, and the new pair is the interesting one.** `018` had two — nothing
 * yet, and nothing matched. This screen has a third, because the same empty response means
 * two different things: an `MP` sees every matter in the firm, so empty means the firm has
 * none; for the other three archetypes it means either that or "you are on none of them". A
 * paralegal told the firm has no cases would reasonably conclude the product is broken.
 *
 * **The register never fetches a matter's record** — research D4. Not per row, not on hover,
 * not to warm a cache. Every one of those is an ordinary frontend technique and every one
 * writes an audit entry, and an access log that records what a cursor passed over is worse
 * than no log at all.
 */
'use client';

import { useState } from 'react';
import { useInfiniteQuery, useQueries, type InfiniteData } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import { can } from '@/authz/can';
import type { FailedResponse } from '@/lib/api-client';
import { listCaseCatalog, listCases, type CaseCatalog } from '@/cases/api';
import type { CaseListItem, CaseListResponse, CatalogEntry } from '@/cases/types';
import type { Archetype } from '@/session/types';
import { ALL, CaseFilters } from './CaseFilters';
import { CaseDetailPanel } from './CaseDetailPanel';
import { CaseFormDialog } from './CaseFormDialog';
import { CaseRow, type ClosingState } from './CaseRow';

/** Matches `006`'s own default page size; the server caps it regardless. */
const PAGE_SIZE = 50;

const CATALOGS: readonly CaseCatalog[] = ['case-statuses', 'matter-types', 'venues'];

export interface CaseRegisterProps {
  /**
   * The active membership's archetype, resolved server-side by the route.
   *
   * A prop rather than a hook: the shell already resolves the principal once, in the root
   * layout, and a second client-side read would be a second answer to a question that has
   * one. It also makes every gating case — and both no-filter empty states — a one-prop
   * change in a test.
   */
  readonly archetype: Archetype;
}

export function CaseRegister({ archetype }: CaseRegisterProps): React.JSX.Element {
  const [q, setQ] = useState('');
  const [matterTypeId, setMatterTypeId] = useState(ALL);
  const [venueId, setVenueId] = useState(ALL);
  /*
   * The matter being read, and whether the panel is showing it.
   *
   * `openCaseId` outlives `panelOpen` on purpose: the panel stays mounted while closed so it
   * can restore focus and the page's scroll position to whatever opened it — unmounting it
   * takes both away, and losing the reader's place is the one thing a panel exists to avoid.
   */
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const mayCreate = can('case.create', archetype);
  const mayOpen = can('case.read', archetype);
  /**
   * `MP` and `SA` satisfy the assignment rule unconditionally (`006` Decision 2), so for them
   * an empty register genuinely means the firm has no matters. For everyone else it may mean
   * that or "you are on none of them", and the copy has to be true in both cases.
   */
  const seesEverything = archetype === 'MP' || archetype === 'SA';

  const hasFilter = q.trim().length > 0 || matterTypeId !== ALL || venueId !== ALL;

  /*
   * The three catalogs, read once per screen and never per row. Two of them fill the filter
   * selects; `case-statuses` carries the `isClosing` the badge needs.
   *
   * Failure is tolerated on purpose — `QueryBoundary` below watches the case list, not these.
   * A decoration that cannot load must not take the register down (research D2).
   */
  const catalogQueries = useQueries({
    queries: CATALOGS.map((catalog) => ({
      queryKey: ['case-catalog', catalog],
      queryFn: () => listCaseCatalog(catalog),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  const [statuses, matterTypes, venues] = catalogQueries.map(
    (query) => (query.data?.items ?? []) as readonly CatalogEntry[],
  );

  /** Status id → whether the firm declared it closing. Absent when the catalog is unavailable. */
  const closingById = new Map<string, boolean>(
    (statuses ?? []).map((entry) => [entry.id, entry.isClosing === true]),
  );
  const catalogUnavailable = closingById.size === 0;

  const closingStateOf = (item: CaseListItem): ClosingState => {
    if (catalogUnavailable) return 'unknown';
    return closingById.get(item.status.id) === true ? 'true' : 'false';
  };

  /*
   * The error type is spelled out because TypeScript cannot infer it: a rejection has no
   * type, so this would default to `Error` — and `QueryBoundary` needs the `{status, body}`
   * shape `classifyRefusal` reads. Get it wrong and every refusal arrives as a bare `Error`,
   * classifies as opaque, and a permission refusal renders as "something went wrong".
   */
  const query = useInfiniteQuery<
    CaseListResponse,
    FailedResponse | null,
    InfiniteData<CaseListResponse, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    // The filters are part of the key, which is what makes changing one reset the cursor.
    queryKey: ['cases', q.trim(), matterTypeId, venueId],
    queryFn: ({ pageParam }) =>
      listCases({
        q: q.trim() || undefined,
        matterTypeId: matterTypeId === ALL ? undefined : matterTypeId,
        venueId: venueId === ALL ? undefined : venueId,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    // Opaque in, opaque out. `undefined` stops the paging; `null` would be sent back.
    getNextPageParam: (last: CaseListResponse) => last.nextCursor ?? undefined,
  });

  function clearFilters(): void {
    setQ('');
    setMatterTypeId(ALL);
    setVenueId(ALL);
  }

  const items = (query.data?.pages ?? []).flatMap((page) => page.items);
  const showClear = query.status === 'success' && items.length === 0 && hasFilter;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="expedientes-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="expedientes-heading" className="text-3xl font-bold tracking-tight">
          Expedientes
        </h1>
        {mayCreate ? (
          <Button onClick={() => setFormOpen(true)}>
            <Plus aria-hidden className="mr-2 h-4 w-4" />
            Nuevo expediente
          </Button>
        ) : null}
      </div>

      <CaseFilters
        q={q}
        matterTypeId={matterTypeId}
        venueId={venueId}
        onQChange={setQ}
        onMatterTypeChange={setMatterTypeId}
        onVenueChange={setVenueId}
        matterTypes={matterTypes ?? []}
        venues={venues ?? []}
      />

      <QueryBoundary
        query={query}
        isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
        emptyGuidance={emptyGuidance({ hasFilter, q, seesEverything })}
      >
        {(data) => (
          <CaseTable
            items={data.pages.flatMap((page) => page.items)}
            closingStateOf={closingStateOf}
            onOpen={
              mayOpen
                ? (item) => {
                    setOpenCaseId(item.id);
                    setPanelOpen(true);
                  }
                : undefined
            }
          />
        )}
      </QueryBoundary>

      {/*
       * The way out of a search that found nothing. Beside the empty state rather than
       * inside it: `016a`'s `EmptyState` takes guidance text and nothing else, and giving a
       * shared primitive a slot for one screen's control is how primitives stop being shared.
       */}
      {showClear ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
      ) : null}

      {/*
       * Always mounted; `open` does the work, and the body is keyed on the matter so each
       * opening reads the record it was opened on rather than the previous one.
       *
       * **Nothing here prefetches** (research D4). Every case read writes an audit entry, so
       * a prefetch on hover would record matters a cursor passed over — false, and on a
       * register of legal matters actively misleading.
       */}
      <CaseFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />

      <CaseDetailPanel
        open={panelOpen}
        caseId={openCaseId}
        archetype={archetype}
        onClose={() => setPanelOpen(false)}
      />

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Which of the three empty states applies.
 *
 * The two no-filter cases are the ones worth care. They are the same response —
 * `{ items: [] }` — and the screen distinguishes them by what the caller is entitled to see,
 * because that is the only information available. The copy for the restricted case is true
 * whichever of the two situations actually holds.
 */
function emptyGuidance({
  hasFilter,
  q,
  seesEverything,
}: {
  hasFilter: boolean;
  q: string;
  seesEverything: boolean;
}): string {
  if (hasFilter) {
    const term = q.trim();
    return term
      ? `Ningún expediente coincide con “${term}”. Ajusta la búsqueda o limpia los filtros.`
      : 'Ningún expediente coincide con los filtros aplicados. Limpia los filtros para ver todos.';
  }

  return seesEverything
    ? 'Este despacho aún no tiene expedientes. Registra el primero para empezar.'
    : 'No tienes expedientes asignados. Pide a un socio o gestor que te asigne a un asunto.';
}

function CaseTable({
  items,
  closingStateOf,
  onOpen,
}: {
  readonly items: readonly CaseListItem[];
  readonly closingStateOf: (item: CaseListItem) => ClosingState;
  readonly onOpen?: (item: CaseListItem) => void;
}): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Juzgado</TableHead>
            <TableHead>Fecha Inicio</TableHead>
            <TableHead>Estado</TableHead>
            {onOpen ? (
              <TableHead>
                {/* The column exists only when there is an action to put in it. */}
                <span className="sr-only">Acciones</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <CaseRow key={item.id} item={item} closing={closingStateOf(item)} onOpen={onOpen} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
