/**
 * A Nest app exposing the TENANT-FACING surface — the mirror of helpers/platform-app.ts.
 *
 * Wires the same interceptors app.module.ts registers for the tenant path:
 * TenantContextInterceptor activates one tenant and opens its transaction;
 * AuthorizationInterceptor decides against `matrix.ts` (004, research.md D2) — this is
 * what replaces the old `@RequireArchetypes` enforcement that once lived in
 * TenantContextInterceptor itself (see common/permissions/guard.ts); AuditInterceptor
 * appends inside both.
 */
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { TenantContextInterceptor } from '../../src/common/tenant/middleware';
import { AuthorizationInterceptor } from '../../src/common/authz/interceptor';
import { AuditInterceptor } from '../../src/common/audit/interceptor';
import {
  InMemoryMembershipPort,
  MEMBERSHIP_PORT,
  type MembershipPort,
  type MembershipRecord,
} from '../../src/common/tenant/membership';

export function buildTenantTestModuleWithPort(port: MembershipPort) {
  @Module({
    imports: [AuditModule],
    providers: [
      { provide: MEMBERSHIP_PORT, useValue: port },
      { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
      { provide: APP_INTERCEPTOR, useClass: AuthorizationInterceptor },
      { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ],
  })
  class TenantTestModule {}
  return TenantTestModule;
}

export function buildTenantTestModule(memberships: readonly MembershipRecord[]) {
  return buildTenantTestModuleWithPort(new InMemoryMembershipPort(memberships));
}

export async function createTenantApp(
  memberships: readonly MembershipRecord[],
): Promise<INestApplication> {
  const app = await NestFactory.create(buildTenantTestModule(memberships), { logger: false });
  await app.init();
  return app;
}

/** slice 002 — the real-adapter counterpart, for SC-001's re-run requirement. */
export async function createTenantAppWithPort(port: MembershipPort): Promise<INestApplication> {
  const app = await NestFactory.create(buildTenantTestModuleWithPort(port), { logger: false });
  await app.init();
  return app;
}
