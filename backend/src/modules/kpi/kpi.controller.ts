/**
 * 015 — `GET /tenant/kpis`. FR-005, FR-011, Decision 6.
 *
 * NO `@Audited`, deliberately, and on a precedent rather than a preference: the newest read
 * route in the product, `GET /tenant/calendar/events`, carries none, and neither do the client,
 * case, document or category lists. Principle V requires recording access to cases and
 * documents; an aggregate exposes no matter — it is a count. The audited mutation this slice
 * adds is `case.outcome_declared`, which changes a matter's record.
 *
 * NO `@ScopeTarget`: `kpi.read` resolves at `tenant` scope, and
 * `tests/contract/scope-target-declared.test.ts` refuses an inert one. The rows need no
 * narrowing because the three archetypes granted this capability are the three that already see
 * every matter in the firm (Decision 4) — which is why `AA` and `PL` are refused outright rather
 * than served a scoped variant that would mean nothing.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { Capability } from '../../common/authz/declare';
import { KpiService, type KpiResponse } from './kpi.service';

@Controller('tenant/kpis')
export class KpiController {
  constructor(private readonly kpis: KpiService) {}

  @Get()
  @Capability('kpi.read')
  async summary(@Query() query: Record<string, unknown>): Promise<KpiResponse> {
    return this.kpis.summary(query);
  }
}
