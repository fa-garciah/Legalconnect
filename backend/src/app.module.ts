import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextInterceptor } from './common/tenant/middleware';
import { PlatformContextInterceptor } from './common/db/platform-context';
import { AuditInterceptor } from './common/audit/interceptor';
import { DbMembershipPort, MEMBERSHIP_PORT } from './common/tenant/membership';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuditModule } from './modules/audit/audit.module';
import { PlanModule } from './modules/plan/plan.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InvitationModule } from './modules/invitation/invitation.module';
import { MembershipModule } from './modules/membership/membership.module';

/**
 * Registration of the cross-cutting mechanisms. T051, T060.
 *
 * The constitution requires these to be GLOBAL, never per endpoint: an endpoint that
 * has to apply one by hand is a design violation, because the mechanism must apply by
 * default and omitting it must be an explicit, reviewable act rather than a possible
 * oversight. Hence APP_INTERCEPTOR rather than controller decorators. There is no
 * APP_GUARD here — see common/permissions/guard.ts for why archetype enforcement
 * lives in TenantContextInterceptor instead of a Guard.
 *
 * ORDER IS LOAD-BEARING. Nest runs interceptors outermost-first in registration order:
 *
 *   TenantContextInterceptor     activates one tenant, opens its transaction
 *   PlatformContextInterceptor   opens the platform transaction
 *     └── AuditInterceptor       appends inside whichever one is active
 *
 * The two context interceptors are mutually exclusive by declaration: each inspects
 * the route's `@PlatformSurface()` marker and passes straight through when the route is
 * not its own. Reversing either against the audit interceptor would leave it with no
 * transaction to write into, and FR-017's atomicity would be silently lost — the
 * mutation could commit while its entry failed separately.
 *
 * The membership port is `DbMembershipPort` (slice 002) — the real
 * `identity`/`membership` tables, replacing 001's empty in-memory adapter.
 * `InMemoryMembershipPort` is unchanged and still used directly by 001's
 * fixture-driven test helpers; this is the one place its production binding
 * changes.
 */
@Module({
  imports: [
    TenantModule,
    AuditModule,
    PlanModule,
    IdentityModule,
    InvitationModule,
    MembershipModule,
  ],
  providers: [
    { provide: MEMBERSHIP_PORT, useClass: DbMembershipPort },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PlatformContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
