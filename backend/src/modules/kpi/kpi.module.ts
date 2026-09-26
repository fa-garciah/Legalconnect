/**
 * 015-kpi-dashboard — the firm's aggregate figures.
 *
 * A read model over `006`'s tables rather than more of `case-core`: it has its own capability,
 * its own period arithmetic and no CRUD at all. `013`'s `calendar/` is the shape — one
 * controller, one service, one repository.
 */
import { Module } from '@nestjs/common';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { KpiRepository } from './kpi.repository';

@Module({
  controllers: [KpiController],
  providers: [KpiService, KpiRepository],
})
export class KpiModule {}
