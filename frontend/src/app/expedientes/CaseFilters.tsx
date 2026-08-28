/**
 * T026 — the register's three filters (019/FR-027 to FR-032).
 *
 * **The debounce is why this is its own component.** Typing "torres" without one is six
 * requests: six times the load for one question, and — the part that shows on screen — six
 * responses that can arrive out of order, so the register flickers and can settle on the
 * answer to "torr". Holding the keystrokes here and emitting one committed value keeps the
 * parent's query key stable per question asked.
 *
 * **Who owns what.** This component owns the text in the box, moment to moment. The parent
 * owns the *committed* filter, which is what the query key is built from. They differ for
 * exactly as long as the debounce is running, and the parent can still reset the box — the
 * clear control does — which is the `q !== trackedQ` adjustment below.
 *
 * The two selects do not debounce. They cannot be typed into; every change is a complete,
 * deliberate answer, and delaying it would only make the screen feel slow.
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
import type { CatalogEntry } from '@/cases/types';

/** This screen's word for "no filter". Never sent to the server. */
export const ALL = 'all';

export interface CaseFiltersProps {
  /** The committed search term — what the parent is currently querying with. */
  readonly q: string;
  readonly matterTypeId: string;
  readonly venueId: string;
  /** Called once the typing settles, not once per keystroke. */
  readonly onQChange: (q: string) => void;
  readonly onMatterTypeChange: (id: string) => void;
  readonly onVenueChange: (id: string) => void;
  /** Active entries only — a retired one still resolves on a matter but is not a filter. */
  readonly matterTypes: readonly CatalogEntry[];
  readonly venues: readonly CatalogEntry[];
  /** Overridable so tests need not wait out a human-tuned delay. */
  readonly debounceMs?: number;
}

/**
 * Long enough that a normal typing rhythm produces one request, short enough that the
 * results do not feel detached from the keystroke that asked for them.
 */
const DEBOUNCE_MS = 300;

export function CaseFilters({
  q,
  matterTypeId,
  venueId,
  onQChange,
  onMatterTypeChange,
  onVenueChange,
  matterTypes,
  venues,
  debounceMs = DEBOUNCE_MS,
}: CaseFiltersProps): React.JSX.Element {
  const [draft, setDraft] = useState(q);

  // The parent reset the committed term. Adjust during render rather than in an effect:
  // React's own pattern for state derived from a changing prop, and what `QueryBoundary`
  // already does here.
  const [trackedQ, setTrackedQ] = useState(q);
  if (q !== trackedQ) {
    setTrackedQ(q);
    setDraft(q);
  }

  useEffect(() => {
    if (draft === q) return;
    const timer = setTimeout(() => onQChange(draft), debounceMs);
    return () => clearTimeout(timer);
    // `onQChange` is deliberately absent: an inline arrow from the parent would restart the
    // timer on every parent render, which is the one thing a debounce must not do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, q, debounceMs]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="relative flex-1">
        {/*
         * `sr-only` labels. The placeholder carries the meaning visually, which is what the
         * design asks for, and the label is still programmatically associated — the half
         * FR-024 is actually about. A placeholder alone leaves a screen-reader user with an
         * unnamed input, and it disappears the moment anyone types.
         */}
        <Label htmlFor="case-search" className="sr-only">
          Buscar por número o cliente
        </Label>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="case-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          /*
           * The reference design reads "Buscar por número, cliente o descripción...".
           * **A case has no description in `006`** — the placeholder was corrected rather
           * than the schema extended (contract §1).
           */
          placeholder="Buscar por número o cliente..."
          autoComplete="off"
          className="pl-9"
        />
      </div>

      <CatalogSelect
        id="case-matter-type"
        label="Tipo"
        allLabel="Todos los tipos"
        value={matterTypeId}
        onChange={onMatterTypeChange}
        entries={matterTypes}
      />

      <CatalogSelect
        id="case-venue"
        label="Juzgado"
        allLabel="Todos los juzgados"
        value={venueId}
        onChange={onVenueChange}
        entries={venues}
      />
    </div>
  );
}

function CatalogSelect({
  id,
  label,
  allLabel,
  value,
  onChange,
  entries,
}: {
  readonly id: string;
  readonly label: string;
  readonly allLabel: string;
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly entries: readonly CatalogEntry[];
}): React.JSX.Element {
  return (
    <div className="lg:w-[200px]">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {entries.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
