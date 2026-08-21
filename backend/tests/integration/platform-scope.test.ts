/**
 * T071 / FR-009 / research.md 001/D9 — the platform administration path never
 * traverses the tenant middleware, and reaches only tenant, plan, audit_event,
 * plus (slice 002, research.md D6) a read-only existence-check on membership
 * and a seeded-only insert on invitation.
 *
 * This is the test that keeps the deliberate Principle II exception narrow. The
 * platform role legitimately spans tenants; the point of confining its reach to
 * exactly five tables, two of them narrowed further by column/row restrictions,
 * is that no case file — and no tenant's membership roster — is ever reachable
 * across firms. The exception buys provisioning and the bootstrap seed, never
 * access to privileged material.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('platform administration scope', () => {
  let app: INestApplication;
  let migration: Client;

  beforeAll(async () => {
    app = await createPlatformApp();
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
    await closePlatformDb();
  });

  it('needs no identity or tenant header — it is not a tenant session', async () => {
    // The tenant surface refuses without both headers. This one must not require them,
    // because there is no membership involved. If this ever starts failing, the
    // platform surface has been wired through the tenant middleware by accident.
    const response = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Sin Cabeceras, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });

    expect(response.status).toBe(201);
  });

  it('ignores a tenant header if one is sent', async () => {
    const first = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Cabecera Ignorada, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });

    const response = await request(app.getHttpServer())
      .get(`/internal/platform/tenants/${first.body.id}`)
      .set('x-tenant-id', '00000000-0000-4000-8000-000000000000')
      .set('x-identity-id', '11111111-1111-4111-8111-111111111111');

    // A stray header must not narrow or redirect a platform read.
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(first.body.id);
  });

  it('reads across tenants, which is the whole reason it exists', async () => {
    const a = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Cross A, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });
    const b = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Cross B, S.C.', rfc: uniqueRfc(), planCode: 'premium' });

    for (const created of [a, b]) {
      const response = await request(app.getHttpServer()).get(
        `/internal/platform/tenants/${created.body.id}`,
      );
      expect(response.status).toBe(200);
    }
  });

  it('holds privileges on exactly five tables — the original three plus D6\'s two narrow extensions', async () => {
    const { rows } = await migration.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type
         FROM information_schema.role_table_grants
        WHERE grantee = 'lc_platform'
        ORDER BY table_name, privilege_type`,
    );

    const tables = [...new Set(rows.map((r) => r.table_name))].sort();
    expect(tables).toEqual(['audit_event', 'invitation', 'membership', 'plan', 'tenant']);
  });

  it('the two D6 extensions are narrower than the original three grants — read-only on membership, insert-only on invitation, no identity at all', async () => {
    const { rows } = await migration.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type
         FROM information_schema.role_table_grants
        WHERE grantee = 'lc_platform' AND table_name IN ('membership', 'invitation', 'identity')
        ORDER BY table_name, privilege_type`,
    );

    expect(rows.map((r) => `${r.table_name}:${r.privilege_type}`)).toEqual([
      'invitation:INSERT',
      'membership:SELECT',
    ]);
  });

  it('holds no DELETE on any of them', async () => {
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.role_table_grants
        WHERE grantee = 'lc_platform' AND privilege_type = 'DELETE'`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('is not a superuser and does not bypass RLS', async () => {
    const { rows } = await migration.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'lc_platform'`,
    );
    expect(rows[0]!.rolsuper).toBe(false);
    // Note it reaches across tenants through an explicit POLICY, not by bypassing RLS.
    // The distinction matters: a policy is visible in the catalog and testable; a
    // BYPASSRLS flag is invisible at the point of use.
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  it('reaches across tenants via a policy that is declared, not by exemption', async () => {
    const { rows } = await migration.query<{ policyname: string; qual: string | null }>(
      `SELECT policyname, qual FROM pg_policies
        WHERE tablename = 'tenant' AND roles::text LIKE '%lc_platform%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.qual).toBe('true');
  });
});
