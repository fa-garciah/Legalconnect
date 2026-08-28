/**
 * T027 — one matter, as a row.
 *
 * **Six cells.** The design's seventh, *Abogado*, is not built: no table in this product
 * stores a person's name, so the best any change could produce is a column of email
 * addresses (019 spec, Q2). It returns when slice `003` ships identity.
 *
 * **The badge signals one thing, and the catalog decides it.** `isClosing` is the firm's own
 * declaration that a status ends a matter, and it is the only semantic a per-tenant catalog
 * of free text carries. A firm calling its final status *Archivado* must read the same as one
 * calling it *Concluido*, so the name is never inspected — only the joined flag.
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatCalendarDate } from '@/cases/format';
import type { CaseListItem } from '@/cases/types';

/** What the catalog said about this matter's status, when the catalog was reachable. */
export type ClosingState = 'true' | 'false' | 'unknown';

export interface CaseRowProps {
  readonly item: CaseListItem;
  /**
   * `unknown` when the catalog read failed while the list succeeded. The register is the
   * point of the screen; a decoration failing must not take it down, so the badge falls back
   * to a neutral treatment and the status still reads.
   */
  readonly closing: ClosingState;
  /** Absent when the caller does not hold `case.read` — then no row offers to open. */
  readonly onOpen?: (item: CaseListItem) => void;
}

/** Absent renders as a dash, so "the record is like that" is not mistaken for "the page broke". */
const ABSENT = '—';

export function CaseRow({ item, closing, onOpen }: CaseRowProps): React.JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium">{item.fileNumber}</TableCell>
      <TableCell>{item.client.legalName}</TableCell>
      <TableCell>{item.matterType?.name ?? ABSENT}</TableCell>
      <TableCell>{item.venue?.name ?? ABSENT}</TableCell>
      <TableCell className="whitespace-nowrap">{formatCalendarDate(item.openedOn)}</TableCell>
      <TableCell>
        <Badge
          data-testid="case-status-badge"
          // The flag, exposed so a test can assert the badge read the catalog rather than
          // the status's name — which is the shortcut this whole design exists to prevent.
          data-closing={closing}
          variant={closing === 'true' ? 'secondary' : 'outline'}
          className={cn('whitespace-nowrap', closing === 'true' && 'opacity-80')}
        >
          {item.status.name}
        </Badge>
      </TableCell>
      {onOpen ? (
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpen(item)}
            // Names the matter, so a screen-reader user hears which row's control this is
            // rather than the fifteenth "Abrir" on the page.
            aria-label={`Abrir ${item.fileNumber}`}
          >
            Abrir
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
