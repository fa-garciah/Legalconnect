/**
 * T034, T036 — the client form (018/US2). One component for create and edit.
 *
 * **One component, not two.** The difference between registering a party and correcting one
 * is which call is made and whether `kind` may be chosen. Everything else — the fields, the
 * validation, the refusal handling, the Spanish copy — is identical, and two forms that
 * start identical drift apart at the first change made to only one of them.
 *
 * **`kind` is omitted from the edit payload entirely.** Not sent-unchanged: omitted. `006`
 * refuses a `PATCH` naming it with a `400`, so the natural implementation — spread the
 * loaded client into the body — fails on every save, including saves that only touched the
 * name. `clients/api.ts`'s `updateClient` assembles the payload from a closed list for this
 * reason, and this form never hands it a whole client.
 *
 * **On success the list is invalidated, not patched.** An optimistic update assumes the
 * server will agree. `006` has refusals a browser cannot predict — a capability the caller
 * turns out not to hold, a client a colleague withdrew a second ago — and optimism is
 * exactly wrong where the server knows something you do not. Re-reading costs one request
 * and cannot be wrong.
 *
 * **The form body is keyed, not reset by an effect.** Opening the dialog on a different
 * record has to show that record; the obvious way is an effect that calls `reset` when the
 * id changes, and that is a `setState` inside an effect — a cascading render, and the exact
 * pattern React 19's rules lint rejects. A `key` says the same thing to React directly:
 * different record, different form. React discards the old one, including every field, the
 * validation state and the refusal.
 */
'use client';

import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { createClient, updateClient } from '@/clients/api';
import { clientFormSchema, type ClientFormValues } from '@/clients/schema';
import type { Client } from '@/clients/types';

export interface ClientFormDialogProps {
  readonly open: boolean;
  readonly mode: 'create' | 'edit';
  /** Required in edit mode; the record being corrected. */
  readonly client?: Client;
  readonly onClose: () => void;
  readonly onSaved: (client: Client) => void;
}

const KIND_LABEL = { organization: 'Organización', person: 'Persona' } as const;

export function ClientFormDialog({
  open,
  mode,
  client,
  onClose,
  onSaved,
}: ClientFormDialogProps): React.JSX.Element {
  // Puts focus and the page's scroll position back on close — neither of which a modal
  // does on its own in this composition. See `use-dialog-anchor.ts`; the scroll half is
  // what SC-014 turns on.
  const anchor = useDialogAnchor(open);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg" {...anchor}>
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Corrige los datos de este cliente.'
              : 'Registra una nueva parte para este despacho.'}
          </DialogDescription>
        </DialogHeader>

        <ClientForm
          key={`${mode}:${client?.id ?? 'new'}`}
          mode={mode}
          client={client}
          onClose={onClose}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

function ClientForm({
  mode,
  client,
  onClose,
  onSaved,
}: Omit<ClientFormDialogProps, 'open'>): React.JSX.Element {
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<FailedResponse | null | undefined>(undefined);

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    /*
     * FR-007 and SC-002, and this pair of settings is the whole of it.
     *
     * `onSubmit` means an untouched field shows nothing — a form does not greet someone by
     * telling them they got three things wrong before they typed anything. `onChange` for
     * re-validation means that once a field HAS been judged, correcting it clears the
     * message as they type rather than making them submit again to find out.
     *
     * Neither is `onBlur` alone, which would mark a field wrong for merely being tabbed
     * past on the way to somewhere else.
     */
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      // `kind` starts genuinely unset on create, so the radio group shows no selection and
      // an unanswered form is caught by the schema rather than defaulted past.
      kind: client?.kind,
      legalName: client?.legalName ?? '',
      // Wire → form: `rfc ?? ''`. A controlled input needs a string; `null` would make
      // React switch the field between controlled and uncontrolled and print "null".
      rfc: client?.rfc ?? '',
    } as ClientFormValues,
  });

  const save = useMutation<Client, FailedResponse | null, ClientFormValues>({
    mutationFn: (values) =>
      mode === 'create'
        ? createClient(values)
        : // Two named fields. Never the whole record — see the header note on `kind`.
          updateClient(client!.id, { legalName: values.legalName, rfc: values.rfc }),
    onSuccess: (saved) => {
      // Re-read rather than patch. FR-011: the directory updates without a manual reload,
      // and it updates to what the server actually holds.
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      onSaved(saved);
      onClose();
    },
    onError: (failed) => {
      setRefusal(failed);

      /*
       * contracts/client-screens.md §2.4 — the only screen-level interpretation in this
       * slice, and it is placement and refresh behaviour rather than security copy.
       *
       * A `409 already_deactivated` on an edit means a colleague withdrew this client
       * between the form opening and the save. The refusal is shown like any other, but
       * the record is also re-read: leaving it stale would have the form claiming a status
       * that stopped being true. Putting this in `classifyRefusal` would make a security
       * module carry per-route knowledge, which is the line 016a's research D3 drew.
       */
      if (failed?.body.error.code === 'already_deactivated') {
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
      }
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setRefusal(undefined);
    save.mutate(values);
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <KindField form={form} client={client} isEdit={mode === 'edit'} />

      <Field
        id="client-legal-name"
        label="Razón social"
        error={form.formState.errors.legalName?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...form.register('legalName')}
          />
        )}
      </Field>

      <Field id="client-rfc" label="RFC" error={form.formState.errors.rfc?.message} optional>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...form.register('rfc')}
          />
        )}
      </Field>

      {/*
       * The refusal, against the form, with everything typed still in place (FR-009). Copy
       * comes from `classifyRefusal` unchanged — this screen never writes its own
       * per-status wording, which would be a second security-copy source drifting from
       * 004's non-disclosure rules.
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
 * FR-026: red text beside an input is not an error a screen-reader user receives. The
 * association — `aria-invalid` plus `aria-describedby` pointing at the message — is what
 * makes it one, and it is easy to forget per-field, so it is written once here.
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

/**
 * `kind`: choosable on create, read-only **text** on edit.
 *
 * FR-010. Text rather than a disabled control, because a disabled control still looks like
 * a control — it reads as "not right now", which invites someone to hunt for the condition
 * that would enable it. There is no such condition. An organization does not become a
 * person, and `006` refuses a `PATCH` that suggests otherwise.
 */
function KindField({
  form,
  client,
  isEdit,
}: {
  readonly form: UseFormReturn<ClientFormValues>;
  readonly client?: Client;
  readonly isEdit: boolean;
}): React.JSX.Element {
  const error = form.formState.errors.kind?.message;
  const value = form.watch('kind');

  if (isEdit && client) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Tipo</span>
        <p className="text-sm text-muted-foreground">{KIND_LABEL[client.kind]}</p>
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">Tipo</legend>
      <RadioGroup
        className="flex gap-6"
        value={value ?? ''}
        onValueChange={(next) =>
          form.setValue('kind', next as ClientFormValues['kind'], { shouldValidate: true })
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'client-kind-error' : undefined}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem id="client-kind-organization" value="organization" />
          <Label htmlFor="client-kind-organization">Organización</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="client-kind-person" value="person" />
          <Label htmlFor="client-kind-person">Persona</Label>
        </div>
      </RadioGroup>
      {error ? (
        <p id="client-kind-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
