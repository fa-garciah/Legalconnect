/**
 * 009 T027 (US2, US4). Recording time by hand, and correcting it.
 *
 * Recording: the matter first, offered from `006`'s already-narrowed case list. Correcting: the
 * matter is fixed and shown, never offered (FR-013 — a wrong matter is corrected by deleting and
 * recording again), and only the fields that changed are sent, so the audit row names exactly those.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { listCases } from '@/cases/api';
import type { CaseListResponse } from '@/cases/types';
import { correctEntry, logTime } from '@/time/api';
import { splitMinutes } from '@/time/duration';
import { entryFormSchema, toEntryBody, type EntryFormValues } from '@/time/schema';
import type { EntryBody, TimeEntry } from '@/time/types';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';

export type LogTimeDialogProps =
  | { readonly mode: 'create'; readonly today: string; readonly onClose: () => void }
  | { readonly mode: 'edit'; readonly entry: TimeEntry; readonly today: string; readonly onClose: () => void };

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm';

type FieldErrors = Partial<Record<keyof EntryFormValues, string>>;

function initialValues(props: LogTimeDialogProps): EntryFormValues {
  if (props.mode === 'create') return { caseId: '', workDate: props.today, hours: '', minutes: '', description: '' };
  const { hours, minutes } = splitMinutes(props.entry.minutes);
  return {
    caseId: props.entry.case.id,
    workDate: props.entry.workDate,
    hours: String(hours),
    minutes: String(minutes),
    description: props.entry.description,
  };
}

/** The keys of `after` that differ from `before` — what a correction sends. */
function changedBody(before: EntryBody, after: EntryBody): Partial<EntryBody> {
  const patch: Record<string, unknown> = {};
  for (const key of ['workDate', 'minutes', 'description'] as const) {
    if (before[key] !== after[key]) patch[key] = after[key];
  }
  return patch as Partial<EntryBody>;
}

function refusalCopy(mode: 'create' | 'edit', error: FailedResponse | null): string | null {
  const code = error?.body?.error?.code;
  if (code === 'correction_window_closed') return 'Ya pasaron las 24 horas para corregir este registro.';
  if (code === 'entry_voided') return 'Este registro ya fue eliminado.';
  if (code === 'validation_failed') return 'Revisa los datos del registro.';
  if (error?.status === 404) {
    return mode === 'create' ? 'El expediente elegido ya no está disponible.' : 'Este registro ya no está disponible.';
  }
  return null;
}

export function LogTimeDialog(props: LogTimeDialogProps): React.JSX.Element {
  const { mode, today, onClose } = props;
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const [initial] = useState(() => initialValues(props));
  const [values, setValues] = useState<EntryFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});

  const cases = useQuery<CaseListResponse, FailedResponse | null>({
    queryKey: ['time-cases'],
    queryFn: () => listCases({ limit: 100 }),
    enabled: mode === 'create',
  });

  const save = useMutation<TimeEntry, FailedResponse | null, EntryFormValues>({
    mutationFn: (current) =>
      props.mode === 'create'
        ? logTime(current.caseId, toEntryBody(current))
        : correctEntry(props.entry.case.id, props.entry.id, changedBody(toEntryBody(initial), toEntryBody(current))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-sheet'] });
      onClose();
    },
  });

  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = entryFormSchema(today).safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof EntryFormValues;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(values);
  }

  const fieldError = (field: keyof EntryFormValues) =>
    errors[field] ? (
      <p id={`entry-${field}-error`} role="alert" className="text-sm text-destructive">
        {errors[field]}
      </p>
    ) : null;
  const described = (field: keyof EntryFormValues) =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': `entry-${field}-error` } : {};

  const copy = save.status === 'error' ? refusalCopy(mode, save.error) : null;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" {...anchor}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Registrar horas' : 'Corregir registro'}</DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Tiempo ya trabajado, en un expediente en el que participas.'
                : 'Puedes corregir la fecha, la duración y la descripción durante las primeras 24 horas.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-4">
            {props.mode === 'create' ? (
              <div className="grid gap-2">
                <Label htmlFor="entry-case">Expediente</Label>
                <select
                  id="entry-case"
                  value={values.caseId}
                  onChange={(e) => set('caseId', e.target.value)}
                  className={SELECT_CLASS}
                  {...described('caseId')}
                >
                  <option value="">Elige un expediente</option>
                  {(cases.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fileNumber} — {item.client.legalName}
                    </option>
                  ))}
                </select>
                {fieldError('caseId')}
              </div>
            ) : (
              <p className="text-sm">
                <span className="text-muted-foreground">Expediente: </span>
                <span className="font-medium">{props.entry.case.fileNumber}</span>
              </p>
            )}

            <div className="grid gap-2">
              <Label htmlFor="entry-date">Fecha</Label>
              <Input
                id="entry-date"
                type="date"
                max={today}
                value={values.workDate}
                onChange={(e) => set('workDate', e.target.value)}
                {...described('workDate')}
              />
              {fieldError('workDate')}
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Duración</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="entry-hours">Horas</Label>
                  <Input
                    id="entry-hours"
                    inputMode="numeric"
                    value={values.hours}
                    onChange={(e) => set('hours', e.target.value)}
                    {...described('minutes')}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="entry-minutes">Minutos</Label>
                  <Input
                    id="entry-minutes"
                    inputMode="numeric"
                    value={values.minutes}
                    onChange={(e) => set('minutes', e.target.value)}
                    {...described('minutes')}
                  />
                </div>
              </div>
              {fieldError('minutes')}
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor="entry-description">Descripción</Label>
              <Textarea
                id="entry-description"
                value={values.description}
                maxLength={1000}
                onChange={(e) => set('description', e.target.value)}
                {...described('description')}
              />
              {fieldError('description')}
            </div>

            {save.status === 'error' ? (
              copy ? (
                <p role="alert" className="text-sm text-destructive">
                  {copy}
                </p>
              ) : (
                <ErrorState refusal={classifyRefusal(save.error)} onRetry={() => save.mutate(values)} />
              )
            ) : null}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {mode === 'create' ? 'Registrar' : 'Guardar corrección'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
