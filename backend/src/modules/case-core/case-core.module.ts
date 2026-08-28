/**
 * T031 — clients, cases, case teams and the three case catalogs.
 *
 * **This module is where 004's `assigned` scope kind becomes real.** `onModuleInit` calls
 * `registerScopeResolver`, the extension seam `common/authz/scope.ts` exported for exactly
 * this: "a downstream slice's own module constructs its resolver through Nest DI (for its
 * own dependencies) and calls `registerScopeResolver(this)` from `onModuleInit` — no file
 * here is edited to do it." That is why `scope.ts` is untouched by this slice, and why
 * this five-line hook is the whole of the wiring.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import { registerScopeResolver } from '../../common/authz/scope';
import { AssignedScopeResolver } from './assigned-scope.resolver';
import { ClientController } from './client.controller';
import { ClientRepository } from './client.repository';
import { ClientService } from './client.service';
import { CaseController } from './case.controller';
import { CaseRepository } from './case.repository';
import { CaseService } from './case.service';
import { CaseAssignmentController } from './case-assignment.controller';
import { CaseAssignmentRepository } from './case-assignment.repository';
import { CaseAssignmentService } from './case-assignment.service';
import { CaseCatalogController } from './catalogs/case-catalog.controller';
import { CaseCatalogRepository } from './catalogs/case-catalog.repository';
import { CaseCatalogService } from './catalogs/case-catalog.service';

@Module({
  controllers: [
    ClientController,
    CaseController,
    CaseAssignmentController,
    CaseCatalogController,
  ],
  providers: [
    AssignedScopeResolver,
    ClientRepository,
    ClientService,
    CaseRepository,
    CaseService,
    CaseAssignmentRepository,
    CaseAssignmentService,
    CaseCatalogRepository,
    CaseCatalogService,
  ],
  // 002's `MembershipService` imports `closeAssignmentsForMembership` from this module as
  // a plain function (FR-012a), not through DI, so nothing needs exporting for it — the
  // same shape 001's `ProvisionService` uses to reach 017's catalog seed.
})
export class CaseCoreModule implements OnModuleInit {
  constructor(private readonly assignedScope: AssignedScopeResolver) {}

  onModuleInit(): void {
    // Before this line, `resolverFor('assigned')` returned `undefined` and `decide()`
    // refused every `assigned`-scoped capability fail-closed — which was 004's deliberate
    // shipped state, and 016a's documented gap. After it, three capabilities resolve.
    registerScopeResolver(this.assignedScope);
  }
}
