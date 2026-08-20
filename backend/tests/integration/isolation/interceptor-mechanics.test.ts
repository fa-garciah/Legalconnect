/**
 * Closes two gaps in TenantContextInterceptor that no existing test reached:
 *
 *  - Every other test keeps the platform and tenant test harnesses strictly
 *    separate (helpers/platform-app.ts's own docblock says so, on purpose — it
 *    mirrors production's separation of concerns). But production's app.module.ts
 *    registers BOTH interceptors globally in the same process, and nothing before
 *    this proved that TenantContextInterceptor actually skips a platform route
 *    when the two coexist, rather than that behaviour being untested.
 *  - Every refusal reason (membership-refusal.test.ts, deactivated-refusal.test.ts)
 *    is exercised by calling `resolvePrincipal` directly. Nothing before this drove
 *    an actual HTTP request through the interceptor with a header combination that
 *    fails resolution, which left its own refusal branch — and the cross-tenant
 *    attempt recording inside it — with no coverage at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../../helpers/db';
import { createTestApp } from '../../helpers/app';
import { TenantContextInterceptor } from '../../../src/common/tenant/middleware';
import { PlatformContextInterceptor } from '../../../src/common/db/platform-context';
import { PlatformSurface } from '../../../src/common/permissions/guard';
import { InMemoryMembershipPort, MEMBERSHIP_PORT } from '../../../src/common/tenant/membership';
import { IDENTITY_OUTSIDER, membershipFixtures, seededTenantIds, type SeededTenants } from '../../helpers/tenants';
import type { MembershipRecord } from '../../../src/common/tenant/membership';

@PlatformSurface()
@Controller('probe-platform')
class PlatformProbeController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  controllers: [PlatformProbeController],
  providers: [
    { provide: MEMBERSHIP_PORT, useValue: new InMemoryMembershipPort([]) },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PlatformContextInterceptor },
  ],
})
class CombinedSurfaceModule {}

describe('TenantContextInterceptor skips a platform route when both surfaces coexist', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(CombinedSurfaceModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers with no identity or tenant header at all', async () => {
    const response = await request(app.getHttpServer()).get('/probe-platform');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

describe('tenant context interceptor — refusal paths over real HTTP', () => {
  let app: INestApplication;
  let platform: Client;
  let tenants: SeededTenants;
  let revokedIdentityId: string;
  let deactivatedTenantId: string;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');

    revokedIdentityId = '77777777-7777-4777-8777-777777777777';

    const rfc = `IRT${String(Date.now()).slice(-6)}Z9A`;
    const { rows } = await platform.query<{ id: string }>(
      `INSERT INTO tenant (name, rfc, plan_id)
       VALUES ('Despacho Interceptor, S.C.', $1, (SELECT id FROM plan WHERE code = 'esencial'))
       RETURNING id`,
      [rfc.toUpperCase().slice(0, 12)],
    );
    deactivatedTenantId = rows[0]!.id;
    await platform.query(
      `UPDATE tenant SET status = 'deactivated', deactivated_at = now() WHERE id = $1`,
      [deactivatedTenantId],
    );

    const memberships: MembershipRecord[] = [
      ...membershipFixtures(tenants),
      {
        id: '88888888-8888-4888-8888-888888888888',
        identityId: revokedIdentityId,
        tenantId: tenants.a,
        archetype: 'SA',
        status: 'revoked',
      },
      // A LIVE membership in the deactivated tenant, so resolution reaches the
      // tenant-active check specifically rather than stopping earlier at
      // "no membership at all".
      {
        id: '99999999-9999-4999-8999-999999999999',
        identityId: IDENTITY_OUTSIDER.id,
        tenantId: deactivatedTenantId,
        archetype: 'SA',
        status: 'live',
      },
    ];
    app = await createTestApp(memberships);
  });

  afterAll(async () => {
    await app.close();
    await platform.end();
  });

  const countAttempts = async (tenantId: string): Promise<number> => {
    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'`,
      [tenantId],
    );
    return Number(rows[0]!.n);
  };

  const MISSING = '00000000-0000-4000-8000-000000000000';

  it('refuses with 400 when no identity header is supplied', async () => {
    const response = await request(app.getHttpServer())
      .get(`/probe/audit/${MISSING}`)
      .set('x-tenant-id', tenants.a);
    expect(response.status).toBe(400);
  });

  it('refuses with 400 when no tenant header is supplied', async () => {
    const response = await request(app.getHttpServer())
      .get(`/probe/audit/${MISSING}`)
      .set('x-identity-id', IDENTITY_OUTSIDER.id);
    expect(response.status).toBe(400);
  });

  it('refuses with 404 and records the attempt when the identity holds no membership', async () => {
    const before = await countAttempts(tenants.a);
    const response = await request(app.getHttpServer())
      .get(`/probe/audit/${MISSING}`)
      .set('x-identity-id', IDENTITY_OUTSIDER.id)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(404);
    expect(await countAttempts(tenants.a)).toBe(before + 1);
  });

  it('refuses with 404 and records the attempt when the membership is revoked', async () => {
    const before = await countAttempts(tenants.a);
    const response = await request(app.getHttpServer())
      .get(`/probe/audit/${MISSING}`)
      .set('x-identity-id', revokedIdentityId)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(404);
    expect(await countAttempts(tenants.a)).toBe(before + 1);
  });

  it('refuses with 404 and records NOTHING when the tenant is deactivated', async () => {
    const before = await countAttempts(deactivatedTenantId);
    const response = await request(app.getHttpServer())
      .get(`/probe/audit/${MISSING}`)
      .set('x-identity-id', IDENTITY_OUTSIDER.id)
      .set('x-tenant-id', deactivatedTenantId);

    expect(response.status).toBe(404);
    expect(await countAttempts(deactivatedTenantId)).toBe(before);
  });
});
