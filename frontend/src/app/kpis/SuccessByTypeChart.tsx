/**
 * 015 — success rate by practice area. US3, FR-007, FR-009a, FR-012.
 *
 * EVERY BAR CARRIES ITS SAMPLE SIZE in the table, because this chart exists to be COMPARED and a
 * comparison without sample sizes is the misleading kind — 100 % from two matters beside 70 %
 * from twenty says the wrong thing loudly.
 *
 * The headline rate on the tile above is protected by a floor (FR-009); this breakdown is
 * deliberately not (FR-009a). Applying one floor to both was measured against `022`'s demo firm
 * and made every bar read "Datos insuficientes" — a correct refusal that demonstrated nothing.
 *
 * Untyped matters get their own bar rather than vanishing (FR-007).
 */
'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { MatterTypeRate } from '@/kpi/api';
import { formatPercent, formatSample } from '@/kpi/format';
import { ChartTable } from './ChartTable';

const CONFIG: ChartConfig = {
  percent: { label: 'Tasa de éxito', color: 'var(--color-chart-positive)' },
};

export function SuccessByTypeChart({
  data,
}: {
  readonly data: readonly MatterTypeRate[];
}): React.JSX.Element {
  const rows = data.map((entry) => ({
    ...entry,
    label: entry.name ?? 'Sin tipo',
    // Recharts cannot plot null, so a group with no declarations is simply not drawn — it is
    // still listed in the table, where the absence is legible rather than invisible.
    percent: entry.rate === null ? null : Math.round(entry.rate * 100),
  }));

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={CONFIG} className="h-[18rem] w-full">
        <BarChart data={rows.filter((row) => row.percent !== null)} margin={{ left: 12, right: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="percent" fill="var(--color-chart-positive)" radius={4} />
        </BarChart>
      </ChartContainer>

      <ChartTable
        caption="Tasa de éxito por tipo de asunto, con el número de asuntos concluidos que la sustenta"
        columns={['Tipo de asunto', 'Tasa de éxito', 'Asuntos']}
        rows={rows.map((entry) => ({
          key: entry.matterTypeId ?? 'sin-tipo',
          cells: [entry.label, formatPercent(entry.rate), formatSample(entry.sampleSize)],
        }))}
      />
    </div>
  );
}
