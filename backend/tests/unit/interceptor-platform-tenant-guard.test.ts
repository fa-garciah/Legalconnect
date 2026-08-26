/**
 * Covers `AuthorizationInterceptor`'s second line of defence: a route cannot carry
 * both `@PlatformSurface()` and a `tenant`-scoped `@Capability()`.
 * `capability-declared-everywhere.test.ts` proves no REAL route does this; this
 * exercises the defensive throw directly, since it is otherwise unreachable through
 * the shipped registry — coverage for FR-008/SC-003's second, load-bearing check
 * (interceptor.ts), found by `npm test -- --coverage`'s 100% gate on `common/authz/**`.
 */
import { Controller, Get, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthorizationInterceptor } from '../../src/common/authz/interceptor';
import { PlatformSurface } from '../../src/common/permissions/guard';
import { Capability } from '../../src/common/authz/declare';

@PlatformSurface()
@Controller('probe')
class MisdeclaredController {
  @Get('conflict')
  @Capability('audit.read_own_tenant') // tenant-scoped, on a platform-surface route
  conflict(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  controllers: [MisdeclaredController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuthorizationInterceptor }],
})
class TestModule {}

describe('a route carrying both @PlatformSurface() and a tenant-scoped capability', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('is refused — the interceptor throws rather than deciding it', async () => {
    const response = await request(app.getHttpServer()).get('/probe/conflict');
    expect(response.status).toBe(500);
  });
});
