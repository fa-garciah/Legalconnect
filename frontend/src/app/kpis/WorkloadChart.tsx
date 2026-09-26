/**
 * 015 — active matters per attorney. US2, FR-006, FR-012, Decision 10.
 *
 * LABELLED BY POSITION, NEVER BY NAME OR EMAIL. No slice stores a person's name (`019` Q2), and
 * an email is personal data reachable only under `membership.read_tenant` — which a `CM` holding
 * `kpi.read` does not have. So an aggregate carries no personal data at all, and the bars read
 * "Socio", "Asociado Senior". That is a real limitation, recorded in the spec rather than papered
 * over, and it disappears the day any slice stores a display name.
 *
 * A MATTER NOBODY LEADS GETS ITS OWN BAR. An inner join would have dropped exactly the matters a
 * case manager opens this chart to find.
 */
'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { AttorneyLoad } from '@/kpi/api';
import { ChartTable } from './ChartTable';

const CONFIG: ChartConfig = {
  activeCases: { label: 'Asuntos activos', color: 'var(--color-chart-1)' },
};

/** Two people may share a position, so the label carries a short reference to tell them apart. */
function labelFor(entry: AttorneyLoad, duplicated: boolean): string {
  if (entry.membershipId === null) return 'Sin responsable';
  const position = entry.position ?? 'Sin puesto';
  return duplicated ? `${position} ·${entry.membershipId.slice(0, 4)}` : position;
}

export function WorkloadChart({
  data,
}: {
  readonly data: readonly AttorneyLoad[];
}): React.JSX.Element {
  const counts = new Map<string, number>();
  for (const entry of data) {
    const key = entry.position ?? '—';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = data.map((entry) => ({
    ...entry,
    label: labelFor(entry, (counts.get(entry.position ?? '—') ?? 0) > 1),
  }));

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={CONFIG} className="h-[18rem] w-full">
        <BarChart data={[...rows]} layout="vertical" margin={{ left: 12, right: 12 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="activeCases" fill="var(--color-chart-1)" radius={4} />
        </BarChart>
      </ChartContainer>

      <ChartTable
        caption="Asuntos activos por responsable"
        columns={['Responsable', 'Asuntos activos']}
        rows={rows.map((entry) => ({
          key: entry.membershipId ?? 'sin-responsable',
          cells: [entry.label, String(entry.activeCases)],
        }))}
      />
    </div>
  );
}
