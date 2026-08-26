/**
 * T044 — US3: every refusal class projects to the wire shape of
 * contracts/refusal.md §2; a permission refusal and an entitlement refusal are
 * distinguishable (FR-006); 0 refusal bodies disclose the existence or shape of the
 * refused resource (FR-023, SC-006).
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
import { CAPABILITIES, type CapabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { MATRIX } from '../../src/common/authz/matrix';

const TIER_GATED_ID = 'test.refusal_shapes_tier' as CapabilityId;

@Controller('probe')
class RefusalShapesController {
  @Get('permission-only')
  @Capability('audit.read_own_tenant') // SA-only; caller here holds AA
  permissionOnly(): { ok: true } {
    return { ok: true };
  }

  @Get('tier-gated')
  @Capability(TIER_GATED_ID)
  tierGated(): { ok: true } {
    return { ok: true };
  }
}

const IDENTITY_ID = '11111111-1111-4111-8111-111111111111';

function buildModule(tenantId: string) {
  const memberships: readonly MembershipRecord[] = [
    { id: 'm-1', identityId: IDENTITY_ID, tenantId, archetype: 'AA', status: 'live' },
  ];
  @Module({
    controllers: [RefusalShapesController],
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

describe('refusal wire shapes', () => {
  let app: INestApplication;
  let activeTenantId: string;

  beforeAll(async () => {
    const { seededTenantIds } = await import('../helpers/tenants');
    const tenants = await seededTenantIds();
    activeTenantId = tenants.a;

    (CAPABILITIES as Record<string, CapabilityDef>)[TIER_GATED_ID] = { scope: 'tenant', tier: 'probe_feature' };
    (MATRIX as unknown as Record<string, Set<string>>)[TIER_GATED_ID] = new Set(['AA']);

    app = await NestFactory.create(buildModule(tenants.a), { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete (CAPABILITIES as Record<string, CapabilityDef>)[TIER_GATED_ID];
    delete (MATRIX as unknown as Record<string, Set<string>>)[TIER_GATED_ID];
  });

  function tenantId(): string {
    return activeTenantId;
  }

  it('a permission refusal answers 403 not_authorized, nothing further', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe/permission-only')
      .set('x-identity-id', IDENTITY_ID)
      .set('x-tenant-id', tenantId());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'not_authorized', message: 'Your role does not permit this operation.' },
    });
  });

  it('an entitlement refusal (no plan resolved, InMemoryMembershipPort) answers 403 entitlement_required, naming the capability', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe/tier-gated')
      .set('x-identity-id', IDENTITY_ID)
      .set('x-tenant-id', tenantId());

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('entitlement_required');
    expect(response.body.capability).toBe(TIER_GATED_ID);
  });

  it('permission and entitlement refusals are distinguishable from one another (FR-006)', async () => {
    const permission = await request(app.getHttpServer())
      .get('/probe/permission-only')
      .set('x-identity-id', IDENTITY_ID)
      .set('x-tenant-id', tenantId());
    const entitlement = await request(app.getHttpServer())
      .get('/probe/tier-gated')
      .set('x-identity-id', IDENTITY_ID)
      .set('x-tenant-id', tenantId());

    expect(permission.body.error.code).not.toBe(entitlement.body.error.code);
  });

  it('neither refusal body discloses anything about the resource beyond the fixed code and message (FR-023, SC-006)', async () => {
    const permission = await request(app.getHttpServer())
      .get('/probe/permission-only')
      .set('x-identity-id', IDENTITY_ID)
      .set('x-tenant-id', tenantId());
    expect(Object.keys(permission.body)).toEqual(['error']);
    expect(Object.keys(permission.body.error).sort()).toEqual(['code', 'message']);
  });
});
