/**
 * 015/FR-012 — the numbers behind every chart, reachable without seeing it.
 *
 * ONE COMPONENT, NOT THREE. Each chart owes exactly the same thing, and three copies is three
 * chances for one to drift or be forgotten — which is how an accessibility requirement quietly
 * becomes two-thirds true.
 *
 * Rendered as a real `<table>` with a `<caption>` rather than hidden text: a screen reader
 * announces it as a table and lets somebody move through it by cell, and a person who simply
 * prefers numbers to bars can read it too. It is not an accommodation bolted beside the chart;
 * it is the same data in the form that survives being copied into an email.
 */
'use client';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface ChartTableProps {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly {
    readonly key: string;
    readonly cells: readonly string[];
  }[];
}

export function ChartTable({ caption, columns, rows }: ChartTableProps): React.JSX.Element {
  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          {columns.map((column, index) => (
            <TableHead key={column} className={index === 0 ? undefined : 'text-right'}>
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} data-testid={`chart-row-${row.key}`}>
            {row.cells.map((cell, index) => (
              <TableCell
                key={`${row.key}-${index}`}
                className={index === 0 ? 'font-medium' : 'tabular text-right'}
              >
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
