/**
 * T025 — the directory's two filters (018/FR-002, FR-003).
 *
 * **The debounce is the reason this is its own component.** Without it, typing "torres" is
 * six requests. That is six times the load for one question, and — the part that actually
 * shows on screen — six responses that can arrive out of order, so the list flickers and
 * can settle on the answer to "torr". Holding the keystrokes here and emitting one
 * committed value keeps the parent's query key stable per question asked.
 *
 * **Who owns what.** This component owns the text in the box, moment to moment. The parent
 * owns the *committed* filter, which is what the query key is built from. They are
 * different values on purpose: they differ for exactly as long as the debounce is running.
 * The parent can still reset the box — the "Limpiar" control does — and the draft follows,
 * which is the `q !== trackedQ` adjustment below.
 *
 * The status filter does not debounce. It cannot be typed into; every change is a complete,
 * deliberate answer, so delaying it would only make the screen feel slow.
 */
'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ClientStatus } from '@/clients/types';

/** `'all'` is this screen's word for "no status filter"; it is never sent to the server. */
export type StatusFilter = ClientStatus | 'all';

export interface ClientFiltersProps {
  /** The committed search term — what the parent is currently querying with. */
  readonly q: string;
  readonly status: StatusFilter;
  /** Called once the typing settles, not once per keystroke. */
  readonly onQChange: (q: string) => void;
  readonly onStatusChange: (status: StatusFilter) => void;
  /** Overridable so tests need not wait out a human-tuned delay. */
  readonly debounceMs?: number;
}

/**
 * Long enough that a normal typing rhythm produces one request, short enough that the
 * results do not feel detached from the keystroke that asked for them.
 */
const DEBOUNCE_MS = 300;

export function ClientFilters({
  q,
  status,
  onQChange,
  onStatusChange,
  debounceMs = DEBOUNCE_MS,
}: ClientFiltersProps): React.JSX.Element {
  const [draft, setDraft] = useState(q);

  // The parent reset the committed term — the "Limpiar" control, or a navigation. Adjust
  // during render rather than in an effect: this is React's own sanctioned pattern for
  // state derived from a changing prop, and it is what `QueryBoundary` already does.
  const [trackedQ, setTrackedQ] = useState(q);
  if (q !== trackedQ) {
    setTrackedQ(q);
    setDraft(q);
  }

  useEffect(() => {
    if (draft === q) return;
    const timer = setTimeout(() => onQChange(draft), debounceMs);
    return () => clearTimeout(timer);
    // `onQChange` is deliberately absent: an inline arrow from the parent would restart
    // the timer on every parent render, which is the one thing a debounce must not do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, q, debounceMs]);

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <div className="relative flex-1">
        {/*
         * The labels are `sr-only`. The placeholder carries the meaning visually, which is
         * what the design asks for, and the label is still programmatically associated —
         * which is the half that FR-026 is actually about. A placeholder alone would leave
         * a screen-reader user with an unnamed input, and it disappears the moment anyone
         * types.
         */}
        <Label htmlFor="client-search" className="sr-only">
          Buscar por razón social
        </Label>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="client-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Buscar por razón social..."
          autoComplete="off"
          className="pl-9"
        />
      </div>

      <div className="md:w-[200px]">
        <Label htmlFor="client-status" className="sr-only">
          Estado
        </Label>
        <Select value={status} onValueChange={(value) => onStatusChange(value as StatusFilter)}>
          <SelectTrigger id="client-status" aria-label="Estado" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            {/* "Retirado", never "inactive" — the wire's word does not reach the reader. */}
            <SelectItem value="inactive">Retirados</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
