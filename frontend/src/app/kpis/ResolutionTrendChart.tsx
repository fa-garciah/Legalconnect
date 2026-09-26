/**
 * 015 — average resolution time per quarter. US4, FR-008, FR-012.
 *
 * A QUARTER IN WHICH NOTHING CLOSED IS A GAP, NOT A ZERO. `connectNulls` is deliberately left
 * off: joining the line across a missing quarter draws a trend through data that does not exist,
 * and a zero would read as "resolved instantly" — the opposite of "we closed nothing". The table
 * says "Sin datos" for the same quarter, so the absence is legible either way.
 */
'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { QuarterPoint } from '@/kpi/api';
import { formatMonths, formatSample } from '@/kpi/format';
import { ChartTable } from './ChartTable';

const CONFIG: ChartConfig = {
  months: { label: 'Meses', color: 'var(--color-chart-2)' },
};

/** `2026-07-01` → `3T 2026`, which is how a firm names a quarter. */
export function quarterLabel(start: string): string {
  const [year, month] = start.split('-').map(Number) as [number, number, number];
  return `${Math.floor((month - 1) / 3) + 1}T ${year}`;
}

export function ResolutionTrendChart({
  data,
}: {
  readonly data: readonly QuarterPoint[];
}): React.JSX.Element {
  const rows = data.map((point) => ({
    ...point,
    label: quarterLabel(point.quarterStart),
    months: point.averageMonths === null ? null : Number(point.averageMonths.toFixed(1)),
  }));

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={CONFIG} className="h-[18rem] w-full">
        <LineChart data={[...rows]} margin={{ left: 12, right: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="months" stroke="var(--color-chart-2)" strokeWidth={2} dot />
        </LineChart>
      </ChartContainer>

      <ChartTable
        caption="Tiempo promedio de resolución por trimestre"
        columns={['Trimestre', 'Promedio', 'Asuntos concluidos']}
        rows={rows.map((point) => ({
          key: point.quarterStart,
          cells: [point.label, formatMonths(point.averageMonths), formatSample(point.sampleSize)],
        }))}
      />
    </div>
  );
}
