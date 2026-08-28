/**
 * T036, T037 — one matter, opened (019/US2).
 *
 * **A panel over the register, not a route.** `018`'s decision for `018`'s reason: the
 * reader's filter, page and scroll position survive opening and closing one. The accepted
 * cost is that a matter has no shareable link.
 *
 * **This is the only audited read in the slice**, and the query options below are what keep
 * that honest — see the note on them. `006` records an access per interactive call, so one
 * deliberate open must be one entry, not one per render and not one per window focus.
 *
 * **The refusal must stay opaque.** `006` answers `404` for a matter in another tenant, a
 * matter that does not exist, and a matter in this tenant the caller is not on. This
 * component renders the classifier's copy unchanged and adds nothing of its own. Writing
 * something more helpful here — *"no tienes acceso a este expediente"* — would tell a caller
 * that a matter they cannot see exists, which is the entire disclosure the `assigned` scope
 * was built to prevent.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import { can } from '@/authz/can';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import type { FailedResponse } from '@/lib/api-client';
import { changeCaseStatus, listCaseCatalog, readCase } from '@/cases/api';
import { formatCalendarDate } from '@/cases/format';
import type { CaseDetail, CaseTeamMember, CatalogEntry } from '@/cases/types';
import type { Archetype } from '@/session/types';

/** The wire's words for a role; the firm's words are what reach the screen. */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  lead: 'Responsable',
  support: 'Apoyo',
};

const ABSENT = '—';

export interface CaseDetailPanelProps {
  readonly open: boolean;
  /** The matter to read. `null` while nothing is open. */
  readonly caseId: string | null;
  readonly archetype: Archetype;
  readonly onClose: () => void;
}

export function CaseDetailPanel({
  open,
  caseId,
  archetype,
  onClose,
}: CaseDetailPanelProps): React.JSX.Element {
  // Puts focus and the page's scroll position back on close — without which opening a matter
  // from row forty loses the reader's place, which is the whole reason this is a panel.
  const anchor = useDialogAnchor(open);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" {...anchor}>
        {caseId ? (
          <CaseDetailBody key={caseId} caseId={caseId} archetype={archetype} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CaseDetailBody({
  caseId,
  archetype,
}: {
  readonly caseId: string;
  readonly archetype: Archetype;
}): React.JSX.Element {
  const query = useQuery<CaseDetail, FailedResponse | null>({
    queryKey: ['case', caseId],
    queryFn: () => readCase(caseId),
    /*
     * research D3 — every one of these is load-bearing, and the defaults are wrong here.
     *
     * `GET /tenant/cases/:id` writes an audit entry on every interactive call. With the
     * defaults, a reader who alt-tabs away and back writes a second access entry for a
     * matter they opened once, and an access log that counts window focus is one nobody can
     * reason about. Principle V's whole point is that the log means something.
     *
     * So the panel treats the record as a snapshot taken at open. A status change
     * invalidates it explicitly — that re-read is a deliberate access and is legitimately
     * audited.
     *
     * Do not restore the defaults for performance reasons. There is no performance problem
     * here; there is an audit-integrity one.
     */
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    retry: false,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{query.data?.fileNumber ?? 'Expediente'}</DialogTitle>
        <DialogDescription>
          {query.data?.client.legalName ?? 'Detalle del expediente.'}
        </DialogDescription>
      </DialogHeader>

      <QueryBoundary query={query}>
        {(detail) => <CaseDetailContent detail={detail} archetype={archetype} caseId={caseId} />}
      </QueryBoundary>
    </>
  );
}

function CaseDetailContent({
  detail,
  archetype,
  caseId,
}: {
  readonly detail: CaseDetail;
  readonly archetype: Archetype;
  readonly caseId: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Field label="Número">{detail.fileNumber}</Field>
        <Field label="Cliente">{detail.client.legalName}</Field>
        <Field label="Tipo">
          <CatalogValue name={detail.matterType?.name} retired={detail.matterType?.catalogStatus === 'retired'} />
        </Field>
        <Field label="Juzgado">
          <CatalogValue name={detail.venue?.name} />
        </Field>
        {/*
         * The court's own number, and it is a separate field from the venue on purpose — a
         * matter can carry one without the other, and neither implies the other.
         */}
        <Field label="No. de juzgado">{detail.venueCaseReference ?? ABSENT}</Field>
        <Field label="Estado">
          <CatalogValue name={detail.status.name} retired={detail.status.catalogStatus === 'retired'} />
        </Field>
        <Field label="Fecha de inicio">{formatCalendarDate(detail.openedOn)}</Field>
        {/* Derived by the server from the status. Never typed, never sent. */}
        <Field label="Fecha de cierre">{formatCalendarDate(detail.closedOn)}</Field>
      </dl>

      <section aria-labelledby="case-team-heading">
        <h3 id="case-team-heading" className="mb-2 text-sm font-medium">
          Equipo del expediente
        </h3>
        <CaseTeam team={detail.team} />
      </section>

      {can('case.change_status', archetype) ? (
        <StatusControl caseId={caseId} currentStatusId={detail.status.id} />
      ) : null}
    </div>
  );
}

/**
 * Moving a matter forward (019/US4).
 *
 * **The request carries the status and nothing else.** `006` derives the closing date from
 * it — a status the firm declared as ending a matter stamps today, and moving away clears it
 * — and refuses a request that names `closedOn` at all. So `changeCaseStatus` takes an id
 * rather than an object, and this component never assembles a payload from the loaded record.
 */
function StatusControl({
  caseId,
  currentStatusId,
}: {
  readonly caseId: string;
  readonly currentStatusId: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<FailedResponse | null | undefined>(undefined);
  /** Set only for the one refusal this screen words itself. Everything else uses the classifier. */
  const [sameStatus, setSameStatus] = useState(false);

  const catalog = useQueries({
    queries: [
      {
        queryKey: ['case-catalog', 'case-statuses'],
        queryFn: () => listCaseCatalog('case-statuses'),
        staleTime: 5 * 60 * 1000,
        retry: false,
      },
    ],
  })[0];

  // Active entries only. A retired status still resolves on a matter that holds it and must
  // not be a destination for a new change.
  const statuses = ((catalog.data?.items ?? []) as readonly CatalogEntry[]).filter(
    (entry) => entry.status === 'active',
  );

  const change = useMutation<unknown, FailedResponse | null, string>({
    mutationFn: (caseStatusId) => changeCaseStatus(caseId, caseStatusId),
    onSuccess: () => {
      /*
       * Re-read the matter and invalidate the register, so both show what `006` holds rather
       * than what the browser assumed — including the closing date nobody typed.
       *
       * This re-read is the one place a second audit entry for one matter is correct: it is a
       * deliberate access following a deliberate change.
       */
      void queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: (failed) => {
      const code = failed?.body.error.code;

      if (code === 'same_status') {
        // Refused rather than silently accepted, so the audit log never gains a no-op —
        // and the reader is told, rather than watching nothing happen.
        setSameStatus(true);
        return;
      }

      if (code === 'catalog_entry_not_available') {
        void queryClient.invalidateQueries({ queryKey: ['case-catalog'] });
      }

      /*
       * Everything else through the classifier, and `404` in particular. It may mean the
       * caller was taken off the case team between opening it and changing it — and it is
       * byte-identical to a matter that does not exist. Improving on that message here would
       * undo the `assigned` scope's whole point.
       */
      setRefusal(failed);
    },
  });

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <Label htmlFor="case-status-change">Cambiar estado</Label>
      <Select
        value={currentStatusId}
        onValueChange={(value) => {
          setRefusal(undefined);
          setSameStatus(false);
          change.mutate(value);
        }}
        disabled={change.isPending}
      >
        <SelectTrigger id="case-status-change" aria-label="Cambiar estado" className="sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statuses.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sameStatus ? (
        <p role="alert" className="text-sm text-destructive">
          Este expediente ya tiene ese estado.
        </p>
      ) : null}

      {refusal !== undefined ? (
        <ErrorState refusal={classifyRefusal(refusal)} onRetry={() => setRefusal(undefined)} />
      ) : null}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** A catalog value, marked retired where it is — `006/FR-020`. */
function CatalogValue({
  name,
  retired,
}: {
  readonly name?: string;
  readonly retired?: boolean;
}): React.JSX.Element {
  if (!name) return <>{ABSENT}</>;
  return (
    <span className="inline-flex items-center gap-2">
      {name}
      {retired ? (
        <Badge variant="outline" className="text-xs font-normal">
          Retirado
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * The live case team.
 *
 * **A role and an identifier, because there is no name.** No table in this product stores
 * one — `identity` holds an email, `membership` an archetype (019 spec, Q2). Showing the
 * membership id is honest; inventing a display from an email would not be.
 *
 * An empty team is a legitimate, transient state: a freshly created matter has nobody on it
 * until someone is assigned (`006` Decision 3).
 */
function CaseTeam({ team }: { readonly team: readonly CaseTeamMember[] }): React.JSX.Element {
  if (team.length === 0) {
    return (
      <p data-testid="case-team" className="text-sm text-muted-foreground">
        Sin asignar. Este expediente todavía no tiene a nadie del despacho a cargo.
      </p>
    );
  }

  return (
    <ul data-testid="case-team" className="flex flex-col gap-2">
      {team.map((member) => (
        <li key={member.membershipId} className="flex items-center gap-3 text-sm">
          <Badge variant="secondary">{ROLE_LABEL[member.roleOnCase] ?? member.roleOnCase}</Badge>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {member.membershipId}
          </span>
        </li>
      ))}
    </ul>
  );
}
