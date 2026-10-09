/**
 * 024 — contracts/dashboard-api.md. `GET /tenant/dashboard`.
 *
 * `dashboard.read` (row 56) is `tenant` scope: the route names no matter, and a person with no
 * assignments gets an empty dashboard, not a refusal. Every section is narrowed to reachable matters
 * inside the repository. Not `@Audited` (Decision 5).
 */
import { Controller, Get } from '@nestjs/common';
import { Capability } from '../../common/authz/declare';
import { DashboardService, type Dashboard } from './dashboard.service';

@Controller('tenant/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Capability('dashboard.read')
  async read(): Promise<Dashboard> {
    return this.dashboard.read();
  }
}
