import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PermissionGuard } from './common/permissions/guard';
import { TenantContextInterceptor } from './common/tenant/middleware';
import { PlatformContextInterceptor } from './common/db/platform-context';
import { AuditInterceptor } from './common/audit/interceptor';
import { InMemoryMembershipPort, MEMBERSHIP_PORT } from './common/tenant/membership';
import { TenantModule } from './modules/tenant/tenant.module';

/**
 * Registration of the cross-cutting mechanisms. T051, T060.
 *
 * The constitution requires these to be GLOBAL, never per endpoint: an endpoint that
 * has to apply one by hand is a design violation, because the mechanism must apply by
 * default and omitting it must be an explicit, reviewable act rather than a possible
 * oversight. Hence APP_GUARD and APP_INTERCEPTOR rather than controller decorators.
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
 * The membership port is the empty in-memory adapter until slice 002 supplies the
 * database-backed one. Empty is the safe default: with no memberships every tenant
 * request is refused, which fails closed rather than open.
 */
@Module({
  imports: [TenantModule],
  providers: [
    { provide: MEMBERSHIP_PORT, useValue: new InMemoryMembershipPort([]) },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PlatformContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
