/**
 * 023 — the firm-wide document filters. FR-009.
 *
 * Shape copied deliberately from `019`'s `CaseFilters`, down to the `ALL` sentinel and the
 * 300 ms debounce, because two filter bars that behave differently on the same product is a
 * defect a user feels and a reviewer cannot see in a diff.
 *
 * THE DEBOUNCE IS ON THE TEXT BOX ONLY. A select fires once per human decision, so debouncing
 * it would only add lag; a search box fires once per keystroke, and each one is a request.
 */
'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** The screen's "no filter" value. Never sent to the server (`019`'s precedent). */
export const ALL = 'all';

const DEBOUNCE_MS = 300;

export interface DocumentFilterOption {
  readonly id: string;
  readonly label: string;
}

export interface DocumentFiltersProps {
  readonly q: string;
  readonly categoryId: string;
  readonly caseId: string;
  readonly onQChange: (value: string) => void;
  readonly onCategoryChange: (value: string) => void;
  readonly onCaseChange: (value: string) => void;
  readonly categories: readonly DocumentFilterOption[];
  readonly cases: readonly DocumentFilterOption[];
  /** Overridable so a test can drive the debounce without waiting in real time. */
  readonly debounceMs?: number;
}

export function DocumentFilters({
  q,
  categoryId,
  caseId,
  onQChange,
  onCategoryChange,
  onCaseChange,
  categories,
  cases,
  debounceMs = DEBOUNCE_MS,
}: DocumentFiltersProps): React.JSX.Element {
  // Local text, lifted on a timer. The parent's `q` is what the query key reads, so this is
  // what keeps a four-letter word from being four requests.
  const [text, setText] = useState(q);

  useEffect(() => {
    if (text === q) return;
    const timer = setTimeout(() => onQChange(text), debounceMs);
    return () => clearTimeout(timer);
  }, [text, q, onQChange, debounceMs]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor="documentos-buscar" className="sr-only">
          Buscar documentos por nombre o número de expediente
        </Label>
        <Input
          id="documentos-buscar"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Buscar por nombre o número de expediente..."
        />
      </div>

      <FilterSelect
        id="documentos-tipo"
        label="Tipo de documento"
        placeholder="Todos los tipos"
        value={categoryId}
        onChange={onCategoryChange}
        options={categories}
      />

      <FilterSelect
        id="documentos-expediente"
        label="Expediente"
        placeholder="Todos los expedientes"
        value={caseId}
        onChange={onCaseChange}
        options={cases}
      />
    </div>
  );
}

function FilterSelect({
  id,
  label,
  placeholder,
  value,
  onChange,
  options,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly DocumentFilterOption[];
}): React.JSX.Element {
  return (
    <div className="min-w-[12rem]">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
