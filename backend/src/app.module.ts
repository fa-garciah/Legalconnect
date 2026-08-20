import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PermissionGuard } from './common/permissions/guard';

/**
 * Registration of the cross-cutting mechanisms.
 *
 * The constitution requires these to be GLOBAL, never per endpoint: an endpoint that
 * has to apply one by hand is a design violation, because the mechanism must apply by
 * default and omitting it must be an explicit, reviewable act rather than a possible
 * oversight.
 *
 * Registered so far:
 *  - PermissionGuard (deny by default)
 *
 * Still to register, in Phase 3 and Phase 4 of tasks.md:
 *  - TenantContextMiddleware  (T046, T051)
 *  - AuditInterceptor         (T059, T060)
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule {}
