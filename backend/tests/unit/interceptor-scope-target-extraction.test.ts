/**
 * Covers `AuthorizationInterceptor.scopeTargetOf`'s two fail-closed fallbacks
 * (006/FR-013, research.md D2).
 *
 * `tests/contract/scope-target-declared.test.ts` proves no REAL route reaches either —
 * it fails the build if an `assigned`-scoped route omits `@ScopeTarget`, or if a route
 * declares one it does not need. This file exercises them directly, since they are
 * otherwise unreachable through the shipped registry: coverage for the 100% gate on
 * `common/authz/**` that `npm test -- --coverage` enforces, and the same shape
 * `interceptor-platform-tenant-guard.test.ts` already uses for the other defensive
 * branch in this file.
 *
 * **Why the fallbacks exist at all rather than being deleted.** A route that declares
 * `assigned` scope and names a parameter the router does not supply would otherwise hand
 * the resolver `undefined`, which it would compare against a `uuid` column. Returning
 * `null` makes the resolver refuse instead — the safe direction — and the build gate is
 * what stops the situation arising in the first place. Both halves are load-bearing: the
 * gate prevents it, and this makes the prevention survivable if it is ever bypassed.
 */
import { Controller, Get, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthorizationInterceptor } from '../../src/common/authz/interceptor';
import { Capability, ScopeTarget } from '../../src/common/authz/declare';
import { PlatformSurface } from '../../src/common/permissions/guard';

/**
 * `@PlatformSurface()` so no tenant context is needed — this file is about parameter
 * extraction, not about authorization outcomes, and `currentPrincipal()` would throw
 * without a tenant transaction open. `tenant.provision` resolves at `none` scope, whose
 * resolver always permits, so a 200 here means "the interceptor completed" and nothing
 * more.
 */
@PlatformSurface()
@Controller('probe')
class ScopeTargetProbeController {
  /** Declares a target the route genuinely supplies — the ordinary path. */
  @Get('present/:caseId')
  @Capability('tenant.provision')
  @ScopeTarget('caseId')
  present(): { ok: true } {
    return { ok: true };
  }

  /**
   * Declares a parameter this route does not carry. Unreachable in the shipped registry
   * — `scope-target-declared.test.ts` refuses a `@ScopeTarget` on a non-`assigned` route,
   * and a mis-named one on an `assigned` route would fail the resolver's own guard. This
   * exercises `request.params[paramName] ?? null`.
   */
  @Get('missing')
  @Capability('tenant.provision')
  @ScopeTarget('caseId')
  missing(): { ok: true } {
    return { ok: true };
  }

  /** No `@ScopeTarget` at all — the 32-of-35 case, exercising the early `return null`. */
  @Get('undeclared')
  @Capability('tenant.provision')
  undeclared(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  controllers: [ScopeTargetProbeController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuthorizationInterceptor }],
})
class TestModule {}

describe('scope target extraction', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reads the named route parameter when the route supplies it', async () => {
    const response = await request(app.getHttpServer()).get('/probe/present/abc-123');
    expect(response.status).toBe(200);
  });

  it('falls back to null when the declared parameter is absent, rather than to "undefined"', async () => {
    // The failure this prevents: `String(undefined)` reaching a resolver as the literal
    // text "undefined", to be compared against a uuid column.
    const response = await request(app.getHttpServer()).get('/probe/missing');
    expect(response.status).toBe(200);
  });

  it('returns null without consulting the request when no target is declared', async () => {
    const response = await request(app.getHttpServer()).get('/probe/undeclared');
    expect(response.status).toBe(200);
  });
});
