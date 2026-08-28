/**
 * T046 — recording a new matter (019/US3).
 *
 * **Three refusals get placed by hand, and nothing else does.** `006` answers
 * `409 file_number_already_used`, `422 client_not_available` and
 * `422 catalog_entry_not_available` for things the browser could not have known, and each
 * belongs against the field the reader can act on. Everything else goes through `016a`'s
 * classifier untouched. Putting these three in the classifier would make a security module
 * carry per-route knowledge — the line `016a` drew and `018` kept.
 *
 * **`client_not_available` says one thing for three causes.** `006` returns it for a client
 * that is inactive, one belonging to another firm, and one that does not exist — deliberately
 * the same refusal, because a caller must not be able to tell them apart. This screen does
 * not elaborate, and the test asserts it does not.
 *
 * **On success the register is invalidated, not patched.** An optimistic insert assumes the
 * server agreed. `006` has refusals a browser cannot predict, and optimism is exactly wrong
 * where the server knows something you do not.
 */
'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { listClients } from '@/clients/api';
import { createCase, listCaseCatalog, type CaseCatalog } from '@/cases/api';
import { caseFormSchema, type CaseFormValues } from '@/cases/schema';
import type { CaseListItem, CatalogEntry } from '@/cases/types';

const CATALOGS: readonly CaseCatalog[] = ['case-statuses', 'matter-types', 'venues'];

/** This screen's word for "none chosen" in an optional select. Never sent. */
const NONE = 'none';

export interface CaseFormDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSaved: (created: CaseListItem) => void;
}

export function CaseFormDialog({ open, onClose, onSaved }: CaseFormDialogProps): React.JSX.Element {
  const anchor = useDialogAnchor(open);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" {...anchor}>
        <DialogHeader>
          <DialogTitle>Nuevo expediente</DialogTitle>
          <DialogDescription>Registra un asunto nuevo para este despacho.</DialogDescription>
        </DialogHeader>
        {/* Keyed on `open` so each opening starts from a blank form rather than the last one. */}
        <CaseForm key={String(open)} onClose={onClose} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function CaseForm({
  onClose,
  onSaved,
}: Omit<CaseFormDialogProps, 'open'>): React.JSX.Element {
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<FailedResponse | null | undefined>(undefined);
  const [clientSearch, setClientSearch] = useState('');

  const catalogQueries = useQueries({
    queries: CATALOGS.map((catalog) => ({
      queryKey: ['case-catalog', catalog],
      queryFn: () => listCaseCatalog(catalog),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  /**
   * Active entries only (FR-035). A retired entry still resolves on an existing matter and
   * must not be offered for a new one — two different questions, and the catalog's `status`
   * distinguishes them.
   */
  const active = (index: number): readonly CatalogEntry[] =>
    ((catalogQueries[index]?.data?.items ?? []) as readonly CatalogEntry[]).filter(
      (entry) => entry.status === 'active',
    );

  const statuses = active(0);
  const matterTypes = active(1);
  const venues = active(2);

  /*
   * The client picker searches the server (research D6). A firm's client list is unbounded
   * and already paged; a plain select would either truncate silently or fetch everything.
   * `018` already built and tested this search, including the whitespace-is-absent rule.
   */
  const clientQuery = useQueries({
    queries: [
      {
        queryKey: ['clients', clientSearch.trim(), 'all'] as const,
        queryFn: () => listClients({ q: clientSearch.trim() || undefined, status: 'active', limit: 20 }),
        retry: false,
      },
    ],
  })[0];

  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseFormSchema),
    /*
     * `onSubmit` so an untouched field shows nothing; `onChange` for re-validation so that
     * once a field HAS been judged, correcting it clears the message as they type rather
     * than making them submit again to find out.
     */
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      clientId: '',
      fileNumber: '',
      caseStatusId: '',
      matterTypeId: '',
      venueId: '',
      venueCaseReference: '',
      openedOn: '',
    },
  });

  const save = useMutation<CaseListItem, FailedResponse | null, CaseFormValues>({
    mutationFn: (values) => createCase(values),
    onSuccess: (created) => {
      // Re-read rather than insert. FR-040: the register shows what 006 holds.
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      onSaved(created);
      onClose();
    },
    onError: (failed) => {
      const code = failed?.body.error.code;

      /*
       * The three placements. Each puts the refusal on the control the reader can act on,
       * which is the difference between "something went wrong" and "change this field".
       */
      if (code === 'file_number_already_used') {
        form.setError('fileNumber', {
          message: 'Ese número de expediente ya está en uso en este despacho.',
        });
        return;
      }

      if (code === 'client_not_available') {
        // One message for three causes. See the header note.
        form.setError('clientId', {
          message: 'Ese cliente no está disponible. Elige otro o verifica su estado.',
        });
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
        return;
      }

      if (code === 'catalog_entry_not_available') {
        form.setError('caseStatusId', {
          message: 'Una de las opciones elegidas ya no está disponible. Vuelve a elegirla.',
        });
        void queryClient.invalidateQueries({ queryKey: ['case-catalog'] });
        return;
      }

      // Everything else: the classifier's copy, unchanged.
      setRefusal(failed);
    },
  });

  /*
   * Read once, at the top, rather than inline in the JSX.
   *
   * `useWatch` rather than `form.watch()`: the latter returns a function the React Compiler
   * cannot memoise safely, so calling it makes the compiler skip this whole component. The
   * hook form subscribes to the same fields and is a hook the compiler understands.
   */
  const [clientId, caseStatusId, matterTypeId, venueId] = useWatch({
    control: form.control,
    name: ['clientId', 'caseStatusId', 'matterTypeId', 'venueId'],
  });

  const onSubmit = form.handleSubmit((values) => {
    setRefusal(undefined);
    save.mutate(values);
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="case-client" label="Cliente" error={form.formState.errors.clientId?.message}>
        {({ id, describedBy, invalid }) => (
          <div className="flex flex-col gap-2">
            <Input
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder="Buscar cliente por razón social..."
              aria-label="Buscar cliente"
              autoComplete="off"
            />
            <Select
              value={clientId}
              onValueChange={(value) => form.setValue('clientId', value, { shouldValidate: true })}
            >
              <SelectTrigger id={id} aria-label="Cliente" aria-invalid={invalid} aria-describedby={describedBy}>
                <SelectValue placeholder="Selecciona el cliente" />
              </SelectTrigger>
              <SelectContent>
                {(clientQuery.data?.items ?? []).map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.legalName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Field>

      <Field
        id="case-file-number"
        label="Número de expediente"
        error={form.formState.errors.fileNumber?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            placeholder="EXP-2026-0042"
            {...form.register('fileNumber')}
          />
        )}
      </Field>

      <CatalogField
        id="case-status"
        label="Estado inicial"
        placeholder="Selecciona el estado inicial"
        entries={statuses}
        value={caseStatusId}
        onChange={(value) => form.setValue('caseStatusId', value, { shouldValidate: true })}
        error={form.formState.errors.caseStatusId?.message}
      />

      <CatalogField
        id="case-matter-type"
        label="Tipo"
        placeholder="Sin tipo"
        optional
        entries={matterTypes}
        value={matterTypeId || NONE}
        onChange={(value) => form.setValue('matterTypeId', value === NONE ? '' : value)}
      />

      <CatalogField
        id="case-venue"
        label="Juzgado"
        placeholder="Sin juzgado"
        optional
        entries={venues}
        value={venueId || NONE}
        onChange={(value) => form.setValue('venueId', value === NONE ? '' : value)}
      />

      <Field id="case-venue-ref" label="No. de juzgado" optional>
        {({ id }) => <Input id={id} placeholder="1234/2026" {...form.register('venueCaseReference')} />}
      </Field>

      <Field
        id="case-opened-on"
        label="Fecha de inicio"
        optional
        error={form.formState.errors.openedOn?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="date"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...form.register('openedOn')}
          />
        )}
      </Field>

      {/*
       * There is deliberately no field for the closing date (FR-039). It is derived by the
       * server from the status, and `006` refuses a request that names it.
       */}

      {refusal !== undefined ? (
        <ErrorState refusal={classifyRefusal(refusal)} onRetry={() => void onSubmit()} />
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A labelled field with its error programmatically associated.
 *
 * Red text beside an input is not an error a screen-reader user receives. The association —
 * `aria-invalid` plus `aria-describedby` pointing at a live region — is what makes it one,
 * and it is easy to forget per-field, so it is written once.
 */
function Field({
  id,
  label,
  error,
  optional,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly optional?: boolean;
  readonly children: (props: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => React.ReactNode;
}): React.JSX.Element {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ml-1 text-muted-foreground">(opcional)</span> : null}
      </Label>
      {children({ id, describedBy: error ? errorId : undefined, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CatalogField({
  id,
  label,
  placeholder,
  entries,
  value,
  onChange,
  error,
  optional,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly entries: readonly CatalogEntry[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly optional?: boolean;
}): React.JSX.Element {
  return (
    <Field id={id} label={label} error={error} optional={optional}>
      {({ id: fieldId, describedBy, invalid }) => (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={fieldId} aria-label={label} aria-invalid={invalid} aria-describedby={describedBy}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {optional ? <SelectItem value={NONE}>{placeholder}</SelectItem> : null}
            {entries.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
