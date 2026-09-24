/**
 * 013 T015 (US2, US3). Creating or editing an event.
 *
 * Cases are offered from `006`'s case list, which the server already narrows to the caller's
 * assignments, so a person is never offered a case they cannot attach an event to (US2 scenario 2).
 * An edit sends only the fields that changed, so the audit entry names exactly those (FR-009).
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
import { createEvent, updateEvent } from '@/calendar/api';
import { EVENT_TYPE_LABEL, REMINDER_OPTIONS } from '@/calendar/format';
import { emptyForm, eventFormSchema, fromEvent, toEventBody, type EventFormValues } from '@/calendar/schema';
import type { CalendarEvent, EventBody, EventType } from '@/calendar/types';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';

export type EventDialogProps =
  | { readonly open: boolean; readonly mode: 'create'; readonly date: string; readonly onClose: () => void; readonly onSaved: () => void }
  | { readonly open: boolean; readonly mode: 'edit'; readonly event: CalendarEvent; readonly onClose: () => void; readonly onSaved: () => void };

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm';

type FieldErrors = Partial<Record<keyof EventFormValues, string>>;

/** The keys of `after` whose value differs from `before` — what an edit sends. */
function changedBody(before: EventBody, after: EventBody): Partial<EventBody> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof EventBody>;
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) patch[key] = after[key] ?? null;
  }
  return patch as Partial<EventBody>;
}

function refusalCopy(mode: 'create' | 'edit', refusal: FailedResponse | null): string | null {
  const code = refusal?.body?.error?.code;
  if (refusal?.status === 404) {
    return mode === 'create'
      ? 'El expediente elegido ya no está disponible. Elige otro o deja el evento sin expediente.'
      : 'Este evento ya no está disponible.';
  }
  if (code === 'event_cancelled') return 'Este evento ya fue cancelado.';
  if (code === 'validation_failed') return 'Revisa los datos del evento.';
  return null;
}

export function EventDialog(props: EventDialogProps): React.JSX.Element {
  const { open, mode, onClose, onSaved } = props;
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(open);
  const initial = mode === 'edit' ? fromEvent(props.event) : emptyForm(props.date);
  const [values, setValues] = useState<EventFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});

  const cases = useQuery<CaseListResponse, FailedResponse | null>({
    queryKey: ['calendar-cases'],
    queryFn: () => listCases({ limit: 100 }),
    enabled: open,
  });

  const save = useMutation<CalendarEvent, FailedResponse | null, EventFormValues>({
    mutationFn: (current) =>
      mode === 'create'
        ? createEvent(toEventBody(current))
        : updateEvent(props.event.id, changedBody(toEventBody(initial), toEventBody(current))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar-reminders'] });
      onSaved();
    },
  });

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = eventFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof EventFormValues;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(values);
  }

  const fieldError = (field: keyof EventFormValues) =>
    errors[field] ? (
      <p id={`event-${field}-error`} role="alert" className="text-sm text-destructive">
        {errors[field]}
      </p>
    ) : null;

  const copy = save.status === 'error' ? refusalCopy(mode, save.error) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" {...anchor}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Nuevo evento' : 'Editar evento'}</DialogTitle>
            <DialogDescription>Horas en tiempo de la Ciudad de México.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="event-type">Tipo</Label>
              <select
                id="event-type"
                value={values.type}
                onChange={(e) => set('type', e.target.value as EventType)}
                className={SELECT_CLASS}
              >
                {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2 pb-2">
              <input
                id="event-all-day"
                type="checkbox"
                checked={values.allDay}
                onChange={(e) => set('allDay', e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Label htmlFor="event-all-day">Todo el día</Label>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="event-title">Título</Label>
              <Input
                id="event-title"
                value={values.title}
                onChange={(e) => set('title', e.target.value)}
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={errors.title ? 'event-title-error' : undefined}
              />
              {fieldError('title')}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="event-date">Fecha</Label>
              <Input id="event-date" type="date" value={values.date} onChange={(e) => set('date', e.target.value)} />
              {fieldError('date')}
            </div>

            {values.allDay ? (
              <div className="grid gap-2">
                <Label htmlFor="event-end-date">Hasta (opcional)</Label>
                <Input
                  id="event-end-date"
                  type="date"
                  value={values.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                />
                {fieldError('endDate')}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="event-start-time">Hora de inicio</Label>
                  <Input
                    id="event-start-time"
                    type="time"
                    value={values.startTime}
                    onChange={(e) => set('startTime', e.target.value)}
                  />
                  {fieldError('startTime')}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="event-end-time">Hora de fin</Label>
                  <Input
                    id="event-end-time"
                    type="time"
                    value={values.endTime}
                    onChange={(e) => set('endTime', e.target.value)}
                  />
                  {fieldError('endTime')}
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="event-case">Expediente</Label>
              <select
                id="event-case"
                value={values.caseId}
                onChange={(e) => set('caseId', e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Sin expediente</option>
                {(cases.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fileNumber} · {c.client.legalName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="event-location">Lugar</Label>
              <Input id="event-location" value={values.location} onChange={(e) => set('location', e.target.value)} />
              {fieldError('location')}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="event-description">Descripción</Label>
              <Textarea
                id="event-description"
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
                rows={3}
              />
              {fieldError('description')}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="event-reminder">Recordatorio</Label>
              <select
                id="event-reminder"
                value={values.remindMinutesBefore}
                onChange={(e) => set('remindMinutesBefore', e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Sin recordatorio</option>
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {save.status === 'error' ? (
            copy ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {copy}
              </p>
            ) : (
              <div className="mt-4">
                <ErrorState refusal={classifyRefusal(save.error)} onRetry={() => save.mutate(values)} />
              </div>
            )
          ) : null}

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Guardar evento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
