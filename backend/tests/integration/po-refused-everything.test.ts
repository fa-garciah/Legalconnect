/**
 * T035 — US2: PO, over real HTTP against the real router. FR-008, SC-003.
 *
 * `matrix-exhaustive.test.ts` already proves the full (subject × capability) table at
 * the pure-function level, and `capability-declared-everywhere.test.ts` proves no
 * route carries both `@PlatformSurface()` and a `tenant`-scoped capability — which is
 * what makes "PO reaches a tenant-scoped route" structurally impossible over HTTP,
 * not merely untested. This suite is the end-to-end confirmation: every one of the 7
 * platform routes is reachable (not refused for authorization) through the real
 * `AppModule` wiring, not just through `decide()` called directly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { uniqueRfc } from '../helpers/rfc';

/** Neither a permission (403 not_authorized) nor an FR-019 no-capability (404 not_found) refusal. */
function expectNotAuthorizationRefused(response: request.Response): void {
  const isPermissionRefusal = response.status === 403 && response.body?.error?.code === 'not_authorized';
  const isMissingCapabilityRefusal =
    response.status === 404 && response.body?.error?.code === 'not_found';
  expect(isPermissionRefusal).toBe(false);
  expect(isMissingCapabilityRefusal).toBe(false);
}

describe('PO is permitted exactly the 7 platform capabilities, over real HTTP', () => {
  let app: INestApplication;
  let tenants: SeededTenants;

  beforeAll(async () => {
    app = await createRealApp();
    tenants = await seededTenantIds();
  });

  afterAll(async () => {
    await app.close();
  });

  it('tenant.read_registry — GET /internal/platform/tenants/:id', async () => {
    const response = await request(app.getHttpServer()).get(`/internal/platform/tenants/${tenants.a}`);
    expect(response.status).toBe(200);
  });

  it('audit.read_platform — GET /internal/platform/audit', async () => {
    const response = await request(app.getHttpServer()).get('/internal/platform/audit');
    expect(response.status).toBe(200);
  });

  it('tenant.provision — POST /internal/platform/tenants (validation runs, not refused for authorization)', async () => {
    const response = await request(app.getHttpServer()).post('/internal/platform/tenants').send({});
    expectNotAuthorizationRefused(response);
  });

  it('tenant.deactivate — POST /internal/platform/tenants/:id/deactivate', async () => {
    // A nonexistent id would 404 through DeactivateService's own "not found" branch —
    // byte-identical to the FR-019 no-capability refusal by design, and therefore
    // useless as a probe for authorization specifically. A throwaway real tenant,
    // provisioned here, actually completes and proves the capability passed.
    const provisioned = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Throwaway PO Probe, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });
    expect(provisioned.status).toBe(201);

    const response = await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${provisioned.body.id}/deactivate`)
      .send();
    expect(response.status).toBe(200);
    expectNotAuthorizationRefused(response);
  });

  it('tenant.change_plan — PATCH /internal/platform/tenants/:tenantId/plan', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenants.a}/plan`)
      .send({});
    expectNotAuthorizationRefused(response);
  });

  it('plan.configure_limits — PATCH /internal/platform/plans/:planCode/limits', async () => {
    const response = await request(app.getHttpServer())
      .patch('/internal/platform/plans/esencial/limits')
      .send({});
    expectNotAuthorizationRefused(response);
  });

  it('invitation.issue_seed — POST /internal/platform/tenants/:tenantId/seed-administrator', async () => {
    const response = await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${tenants.a}/seed-administrator`)
      .send({});
    expectNotAuthorizationRefused(response);
  });

  it('is exactly 7 platform capabilities — no more, no fewer (cross-checked against the registry)', async () => {
    const { CAPABILITIES } = await import('../../src/common/authz/capability');
    const { MATRIX } = await import('../../src/common/authz/matrix');
    const poOnly = (Object.keys(CAPABILITIES) as Array<keyof typeof CAPABILITIES>).filter(
      (id) => MATRIX[id].size === 1 && MATRIX[id].has('PO'),
    );
    expect(poOnly).toHaveLength(7);
  });
});
