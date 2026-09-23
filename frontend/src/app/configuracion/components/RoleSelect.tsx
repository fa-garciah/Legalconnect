/**
 * 014. A native `<select>` of roles, labelled in Spanish.
 *
 * Native rather than the Radix `Select`: a list of at most six fixed options needs no custom
 * listbox, and the native control is keyboard- and screen-reader-correct on every platform with
 * nothing to maintain. Styled with the same tokens as `Input`.
 */
'use client';

import { ARCHETYPE_LABEL } from '@/shell/archetype-labels';
import type { Archetype } from '@/session/types';

export interface RoleSelectProps {
  readonly id: string;
  readonly value: Archetype | '';
  readonly options: readonly Archetype[];
  readonly onChange: (value: Archetype | '') => void;
  readonly invalid?: boolean;
  readonly describedBy?: string;
}

export function RoleSelect({
  id,
  value,
  options,
  onChange,
  invalid,
  describedBy,
}: RoleSelectProps): React.JSX.Element {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as Archetype | '')}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
    >
      <option value="">Selecciona un rol</option>
      {options.map((archetype) => (
        <option key={archetype} value={archetype}>
          {ARCHETYPE_LABEL[archetype]}
        </option>
      ))}
    </select>
  );
}
