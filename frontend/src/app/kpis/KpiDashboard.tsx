/**
 * 015 — `/kpis`, the firm's figures. FR-005 … FR-016.
 *
 * WHAT IS NOT HERE IS THE POINT. The mockup this was built from shows a fourth tile, *Ingresos*,
 * and a third tab, *Financiero*. There is no invoice, payment, quote or time-entry table anywhere
 * in the schema and `010-billing-core` is unwritten, so both are **absent** rather than stubbed
 * (spec Decision 2). A tile reading "$0" in the most prominent position on a dashboard invites
 * exactly one interpretation, and it is false. `016a` settled the same question for navigation:
 * an honestly absent thing beats a misleading one.
 *
 * EVERY FIGURE IS RENDERED THROUGH `@/kpi/format`, which turns `null` into "Sin datos" rather
 * than into `0`. The endpoint takes care to distinguish "no matter closed" from "resolved
 * instantly"; a `?? 0` anywhere on this screen would throw that away.
 */
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import type { FailedResponse } from '@/lib/api-client';
import { readKpis, type KpiResponse, type PeriodKind } from '@/kpi/api';
import { formatCount, formatDelta, formatMonths, formatPercent, formatSample } from '@/kpi/format';
import { StatTile } from './StatTile';
import { WorkloadChart } from './WorkloadChart';
import { SuccessByTypeChart } from './SuccessByTypeChart';
import { ResolutionTrendChart } from './ResolutionTrendChart';

const PERIOD_LABELS: Readonly<Record<PeriodKind, string>> = {
  month: 'Último mes',
  quarter: 'Último trimestre',
  year: 'Último año',
};

export function KpiDashboard(): React.JSX.Element {
  const [period, setPeriod] = useState<PeriodKind>('quarter');

  const query = useQuery<KpiResponse, FailedResponse | null>({
    queryKey: ['kpis', period],
    queryFn: () => readKpis(period),
  });

  return (
    <section className="flex flex-col gap-6" aria-labelledby="kpis-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 id="kpis-heading" className="font-display text-display font-semibold tracking-tight">
            Panel de indicadores
          </h1>
          <p className="text-small text-muted-foreground">Métricas de desempeño del despacho</p>
        </div>

        <div className="min-w-[12rem]">
          <Label htmlFor="kpis-periodo" className="sr-only">
            Periodo
          </Label>
          <Select value={period} onValueChange={(value) => setPeriod(value as PeriodKind)}>
            <SelectTrigger id="kpis-periodo" aria-label="Periodo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as PeriodKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {PERIOD_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <QueryBoundary query={query}>
        {(data) => (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatTile
                testId="tile-activos"
                label="Asuntos activos"
                value={formatCount(data.activeCases.value)}
                /*
                 * No delta, and not by omission: an active count is a fact about TODAY, and this
                 * product keeps no historical snapshot to compare it with. Showing a change here
                 * would be an assertion about last quarter that nobody recorded.
                 */
              />
              <StatTile
                testId="tile-resolucion"
                label="Tiempo promedio de resolución"
                value={formatMonths(data.averageResolutionMonths.value)}
                delta={formatDelta(data.averageResolutionMonths.delta, 'months')}
                sample={formatSample(data.averageResolutionMonths.sampleSize)}
              />
              <StatTile
                testId="tile-exito"
                label="Tasa de éxito"
                value={formatPercent(data.successRate.value)}
                delta={formatDelta(data.successRate.delta, 'percent')}
                sample={
                  data.successRate.undeclared > 0
                    ? `${formatSample(data.successRate.sampleSize)} · ${data.successRate.undeclared} sin resultado declarado`
                    : formatSample(data.successRate.sampleSize)
                }
                notice={
                  // FR-009 — withheld rather than computed from too little. The notice says why,
                  // so a partner reads a decision rather than a bug.
                  data.successRate.value === null
                    ? 'Datos insuficientes'
                    : undefined
                }
              />
            </div>

            <Tabs defaultValue="rendimiento">
              {/* Two tabs. The mockup's third, *Financiero*, has no data behind it — Decision 2. */}
              <TabsList>
                <TabsTrigger value="rendimiento">Rendimiento</TabsTrigger>
                <TabsTrigger value="asuntos">Asuntos</TabsTrigger>
              </TabsList>

              <TabsContent value="rendimiento" className="flex flex-col gap-8 pt-4">
                <section aria-labelledby="kpis-carga">
                  <h2 id="kpis-carga" className="font-display text-heading font-semibold">
                    Asuntos por responsable
                  </h2>
                  <p className="pb-2 text-small text-muted-foreground">
                    Distribución de la carga de trabajo
                  </p>
                  <WorkloadChart data={data.casesPerAttorney} />
                </section>

                <section aria-labelledby="kpis-tendencia">
                  <h2 id="kpis-tendencia" className="font-display text-heading font-semibold">
                    Tiempo promedio de resolución
                  </h2>
                  <p className="pb-2 text-small text-muted-foreground">Evolución por trimestre</p>
                  <ResolutionTrendChart data={data.resolutionTrend} />
                </section>
              </TabsContent>

              <TabsContent value="asuntos" className="flex flex-col gap-8 pt-4">
                <section aria-labelledby="kpis-tipo">
                  <h2 id="kpis-tipo" className="font-display text-heading font-semibold">
                    Tasa de éxito por tipo de asunto
                  </h2>
                  <p className="pb-2 text-small text-muted-foreground">
                    Porcentaje de asuntos con resultado favorable o convenio
                  </p>
                  <SuccessByTypeChart data={data.successRateByMatterType} />
                </section>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </QueryBoundary>
    </section>
  );
}
