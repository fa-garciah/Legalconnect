/**
 * A Nest app exposing the PLATFORM ADMINISTRATION surface.
 *
 * Built separately from the tenant app on purpose, mirroring the production wiring:
 * this surface never traverses the tenant middleware (FR-009), runs under a different
 * database role, and has no membership to verify. Assembling it in one module with the
 * tenant surface would blur exactly the separation research.md D9 is about.
 */
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { TenantModule } from '../../src/modules/tenant/tenant.module';
import { PlatformContextInterceptor } from '../../src/common/db/platform-context';
import { AuditInterceptor } from '../../src/common/audit/interceptor';

@Module({
  imports: [TenantModule],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: PlatformContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class PlatformTestModule {}

export async function createPlatformApp(): Promise<INestApplication> {
  const app = await NestFactory.create(PlatformTestModule, { logger: false });
  await app.init();
  return app;
}
