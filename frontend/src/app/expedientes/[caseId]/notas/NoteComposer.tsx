/**
 * 008 (US1). Writing a note. The bounds are checked before sending (`noteBodyError`), so a person sees
 * the reason without a round trip; the server checks them again regardless.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { createNote } from '@/notes/api';
import { noteBodyError } from '@/notes/schema';
import type { Note } from '@/notes/types';
import type { FailedResponse } from '@/lib/api-client';

export function NoteComposer({ caseId }: { readonly caseId: string }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation<Note, FailedResponse | null, string>({
    mutationFn: (text) => createNote(caseId, text),
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['case-notes', caseId] });
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = noteBodyError(body);
    setProblem(error);
    if (error) return;
    save.mutate(body.trim());
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <Label htmlFor="nota-nueva">Nueva nota</Label>
      <Textarea
        id="nota-nueva"
        value={body}
        rows={4}
        onChange={(e) => setBody(e.target.value)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? 'nota-nueva-error' : undefined}
      />
      {problem ? (
        <p id="nota-nueva-error" role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      {save.status === 'error' ? <ErrorState refusal={classifyRefusal(save.error)} onRetry={() => save.mutate(body.trim())} /> : null}
      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar nota'}
        </Button>
      </div>
    </form>
  );
}
