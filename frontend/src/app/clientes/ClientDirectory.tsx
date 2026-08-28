/**
 * T026 — the client directory (018/US1).
 *
 * **This screen renders what `006` returned and does not second-guess it.** `006` applies
 * `q` and `status` inside the query, before the page boundary, so a page of 50 is 50
 * *matching* clients and `nextCursor` refers to the next page of matches. Filtering again
 * here would shorten pages while "Cargar más" still promised more — breaking a guarantee
 * `006` verified, from the one place `006` cannot observe (FR-003). There is no `.filter()`
 * below, and that absence is the point.
 *
 * **The states come from `016a` and this slice adds none.** `QueryBoundary` renders exactly
 * one of loading / error / empty / content. The only thing this component decides is
 * *which* empty state — a firm with no clients and a search that matched nothing are
 * different situations with different next actions, and telling both "Aún no hay nada
 * aquí" would help neither (FR-004, SC-005).
 *
 * **Paging appends.** `useInfiniteQuery` keeps the earlier pages and the cursor lives in
 * its page params, so changing a filter changes the query key and the cursor resets on its
 * own — rather than page 2 of the old filter being requested against the new one.
 *
 * **Controls are gated on capability ids, never on archetype lists** (T035, data-model.md's
 * control map). Hiding is cosmetic: the server refuses the underlying request identically
 * whether or not the button rendered (FR-015). What the gate buys is an interface that does
 * not offer actions it knows will be refused.
 */
'use client';

import { useState } from 'react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import { can } from '@/authz/can';
import { listClients } from '@/clients/api';
import type { FailedResponse } from '@/lib/api-client';
import type { Client, ClientListResponse } from '@/clients/types';
import type { Archetype } from '@/session/types';
import { ClientCard } from './ClientCard';
import { ClientFilters, type StatusFilter } from './ClientFilters';
import { ClientFormDialog } from './ClientFormDialog';
import { WithdrawDialog, type WithdrawAction } from './WithdrawDialog';

/** Matches `006`'s own default page size; the server caps it regardless. */
const PAGE_SIZE = 50;

export interface ClientDirectoryProps {
  /**
   * The active membership's archetype, resolved server-side by the route and passed down.
   *
   * A prop rather than a hook: the shell already resolves the principal once, in the root
   * layout, and a second client-side read would be a second answer to a question that has
   * one. It also makes every gating case a one-prop change in a test.
   */
  readonly archetype: Archetype;
}

/**
 * What the form dialog is showing, and whether it is showing it.
 *
 * `open` is a field rather than the state being nullable, because **the dialog stays
 * mounted while closed**. Unmounting it on close looks tidier and breaks keyboard
 * navigation: the dialog restores focus to whatever opened it when it closes, and it cannot
 * do that if it has already been removed from the tree. A keyboard user pressing Escape is
 * then dropped at the top of the document (FR-025). The `mode` and `client` are kept
 * through the close for the same reason — the dialog needs them for the frame in which it
 * is closing.
 */
interface FormState {
  readonly open: boolean;
  readonly mode: 'create' | 'edit';
  readonly client?: Client;
}

/** Which status change is being run, and on which record. Same mounted-while-closed reason. */
interface StatusChangeState {
  readonly open: boolean;
  readonly action: WithdrawAction;
  readonly client?: Client;
  /**
   * Incremented on every opening, and part of the dialog's `key`.
   *
   * **This is load-bearing, and an e2e test is what found that out.** Without it, opening
   * the dialog a second time reuses the first attempt's mutation — which is no longer idle
   * — and restore, which fires on open rather than on a click, silently does nothing. The
   * sequence that breaks is the ordinary one: withdraw a client, then restore it. A fresh
   * key per opening means a fresh mutation, a cleared refusal, and an attempt that actually
   * runs.
   */
  readonly token: number;
}

export function ClientDirectory({ archetype }: ClientDirectoryProps): React.JSX.Element {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [form, setForm] = useState<FormState>({ open: false, mode: 'create' });
  const [statusChange, setStatusChange] = useState<StatusChangeState>({
    open: false,
    action: 'withdraw',
    token: 0,
  });

  const mayCreate = can('client.create', archetype);
  const mayUpdate = can('client.update', archetype);
  /*
   * One capability for both controls — 006/FR-004a puts withdraw and restore on row 28
   * together. `PL` is offered neither, which is 006's Q1 resolved on 2026-08-27: a lawyer
   * may register and correct a party and may not take one out of circulation. This slice
   * renders that decision; it does not reinterpret it.
   */
  const mayChangeStatus = can('client.deactivate', archetype);

  const hasFilter = q.trim().length > 0 || status !== 'all';

  /*
   * The error type is spelled out because TypeScript cannot infer it: a rejection has no
   * type, so `useInfiniteQuery` would default to `Error` — and `QueryBoundary` needs the
   * `{status, body}` shape `classifyRefusal` reads. Getting this wrong is not a nuisance:
   * every refusal would arrive as a bare `Error`, classify as opaque, and a plan-limit or
   * permission refusal would render as "something went wrong".
   *
   * `null` is in the union for a network failure, where there is no response to classify.
   */
  const query = useInfiniteQuery<
    ClientListResponse,
    FailedResponse | null,
    InfiniteData<ClientListResponse, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    // The filters are part of the key, which is what makes changing one reset the cursor.
    queryKey: ['clients', q.trim(), status],
    queryFn: ({ pageParam }) =>
      listClients({
        q: q.trim() || undefined,
        status: status === 'all' ? undefined : status,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    // Opaque in, opaque out. `undefined` stops the paging; `null` would be sent back.
    getNextPageParam: (last: ClientListResponse) => last.nextCursor ?? undefined,
  });

  function clearFilters(): void {
    setQ('');
    setStatus('all');
  }

  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const showClear = query.status === 'success' && items.length === 0 && hasFilter;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="clientes-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="clientes-heading" className="text-3xl font-bold tracking-tight">
          Directorio de Clientes
        </h1>
        {mayCreate ? (
          <Button onClick={() => setForm({ open: true, mode: 'create' })}>
            <Plus aria-hidden className="mr-2 h-4 w-4" />
            Nuevo cliente
          </Button>
        ) : null}
      </div>

      <ClientFilters q={q} status={status} onQChange={setQ} onStatusChange={setStatus} />

      <QueryBoundary
        query={query}
        isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
        emptyGuidance={
          hasFilter
            ? // Names the term so the reader can see they searched what they meant to.
              `Ningún cliente coincide con “${q.trim() || 'los filtros aplicados'}”. Ajusta la búsqueda o limpia los filtros.`
            : 'Este despacho aún no tiene clientes. Registra el primero para empezar.'
        }
      >
        {(data) => (
          <ClientGrid
            clients={data.pages.flatMap((page) => page.items)}
            onEdit={mayUpdate ? (client) => setForm({ open: true, mode: 'edit', client }) : undefined}
            onChangeStatus={
              mayChangeStatus
                ? (client) =>
                    setStatusChange((current) => ({
                      open: true,
                      // The record's own status decides which direction this goes, so one
                      // control per row rather than two, one of which is always wrong.
                      action: client.status === 'active' ? 'withdraw' : 'restore',
                      client,
                      token: current.token + 1,
                    }))
                : undefined
            }
          />
        )}
      </QueryBoundary>

      {/*
       * The way out of a search that found nothing. Rendered beside the empty state rather
       * than inside it: `016a`'s `EmptyState` takes guidance text and nothing else, and
       * giving it a slot for an arbitrary control would make a shared primitive carry one
       * screen's needs.
       */}
      {showClear ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
      ) : null}

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

      {/*
       * Always mounted; `open` does the work. The dialog keys its own body on the record,
       * so each opening starts from that record rather than from whatever the previous one
       * left behind — without an unmount, which is what would cost the focus return.
       */}
      <ClientFormDialog
        open={form.open}
        mode={form.mode}
        client={form.mode === 'edit' ? form.client : undefined}
        onClose={() => setForm((current) => ({ ...current, open: false }))}
        onSaved={() => setForm((current) => ({ ...current, open: false }))}
      />

      {/*
       * Mounted only once a record has been chosen — unlike the form dialog, this one has
       * no meaning without one, and `restore` fires its request on open.
       */}
      {statusChange.client ? (
        <WithdrawDialog
          key={`${statusChange.action}:${statusChange.client.id}:${statusChange.token}`}
          open={statusChange.open}
          action={statusChange.action}
          client={statusChange.client}
          onClose={() => setStatusChange((current) => ({ ...current, open: false }))}
          onDone={() => setStatusChange((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </section>
  );
}

function ClientGrid({
  clients,
  onEdit,
  onChangeStatus,
}: {
  readonly clients: readonly Client[];
  /** Absent when the caller does not hold `client.update` — then no card offers the control. */
  readonly onEdit?: (client: Client) => void;
  /** Absent when the caller does not hold `client.deactivate`. */
  readonly onChangeStatus?: (client: Client) => void;
}): React.JSX.Element {
  return (
    <ul
      // A list, so assistive technology announces how many clients there are before the
      // reader starts through them. `list-none` because the marker would be noise beside a
      // card, and the semantics are what matter here, not the bullet.
      className="grid list-none grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
    >
      {clients.map((client) => (
        <li key={client.id}>
          <ClientCard client={client} onEdit={onEdit} onChangeStatus={onChangeStatus} />
        </li>
      ))}
    </ul>
  );
}
