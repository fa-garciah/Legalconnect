/**
 * T021 — a route with no `@Capability` is unreachable. SC-013, FR-019, FR-023. This
 * is the fail-open path spec.md §2 describes, closed: today an undeclared route is
 * reachable by every live membership of the tenant.
 */
import { Controller, Get, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { TenantContextInterceptor } from '../../src/common/tenant/middleware';
import { AuthorizationInterceptor } from '../../src/common/authz/interceptor';
import { AuditInterceptor } from '../../src/common/audit/interceptor';
import {
  InMemoryMembershipPort,
  MEMBERSHIP_PORT,
  type MembershipRecord,
} from '../../src/common/tenant/membership';
import { Capability } from '../../src/common/authz/declare';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';

@Controller('probe')
class UndeclaredProbeController {
  /** Deliberately carries no @Capability — the case under test. */
  @Get('undeclared')
  undeclared(): { ok: true } {
    return { ok: true };
  }

  /** A sibling, declared route — proves the module's wiring itself is sound. */
  @Get('declared')
  @Capability('audit.read_own_tenant')
  declared(): { ok: true } {
    return { ok: true };
  }
}

const IDENTITY_ID = '11111111-1111-4111-8111-111111111111';

function buildModule(tenantId: string) {
  const memberships: readonly MembershipRecord[] = [
    {
      id: '33333333-3333-4333-8333-333333333333',
      identityId: IDENTITY_ID,
      tenantId,
      archetype: 'SA',
      status: 'live',
    },
  ];
  @Module({
    controllers: [UndeclaredProbeController],
    providers: [
      { provide: MEMBERSHIP_PORT, useValue: new InMemoryMembershipPort(memberships) },
      { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
      { provide: APP_INTERCEPTOR, useClass: AuthorizationInterceptor },
      { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ],
  })
  class TestModule {}
  return TestModule;
}

describe('an undeclared route is unreachable', () => {
  let app: INestApplication;
  let tenants: SeededTenants;

  beforeAll(async () => {
    // A real, active seeded tenant — tenantIsActive() checks the real database
    // regardless of which MembershipPort resolves the membership itself.
    tenants = await seededTenantIds();
    app = await NestFactory.create(buildModule(tenants.a), { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 404 with the generic not-found body, for a caller holding a live membership', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe/undeclared')
      .set('x-identity-id', IDENTITY_ID)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'not_found', message: 'The requested resource does not exist.' },
    });
  });

  it('a sibling declared route on the same controller answers normally', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe/declared')
      .set('x-identity-id', IDENTITY_ID)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
