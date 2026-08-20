/**
 * A Nest app exposing the TENANT-FACING surface — the mirror of helpers/platform-app.ts.
 *
 * Wires the same interceptors app.module.ts registers for the tenant path:
 * TenantContextInterceptor activates one tenant, opens its transaction, and enforces
 * `@RequireArchetypes` once the principal is resolved (see common/permissions/guard.ts
 * for why that isn't a Guard); AuditInterceptor appends inside it.
 */
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { TenantContextInterceptor } from '../../src/common/tenant/middleware';
import { AuditInterceptor } from '../../src/common/audit/interceptor';
import {
  InMemoryMembershipPort,
  MEMBERSHIP_PORT,
  type MembershipRecord,
} from '../../src/common/tenant/membership';

export function buildTenantTestModule(memberships: readonly MembershipRecord[]) {
  @Module({
    imports: [AuditModule],
    providers: [
      { provide: MEMBERSHIP_PORT, useValue: new InMemoryMembershipPort(memberships) },
      { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
      { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ],
  })
  class TenantTestModule {}
  return TenantTestModule;
}

export async function createTenantApp(
  memberships: readonly MembershipRecord[],
): Promise<INestApplication> {
  const app = await NestFactory.create(buildTenantTestModule(memberships), { logger: false });
  await app.init();
  return app;
}
