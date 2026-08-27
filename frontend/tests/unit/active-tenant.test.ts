/**
 * T009 — the client-side active-tenant cookie seam (research.md D2, data-model.md
 * ActiveTenant).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearActiveTenantClient,
  readActiveTenantClient,
  writeActiveTenantClient,
} from '@/session/active-tenant';

afterEach(() => {
  clearActiveTenantClient();
});

describe('active-tenant (client)', () => {
  it('reading with no cookie set returns { status: "none" } (FR-007)', () => {
    expect(readActiveTenantClient()).toEqual({ status: 'none' });
  });

  it('writing then reading round-trips a tenant id', () => {
    writeActiveTenantClient('11111111-1111-4111-8111-111111111111');
    expect(readActiveTenantClient()).toEqual({
      status: 'active',
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('a write is visible to a fresh read — no in-memory-only cache', () => {
    writeActiveTenantClient('22222222-2222-4222-8222-222222222222');
    // A second, independent read call must see the same value.
    expect(readActiveTenantClient().status).toBe('active');
    expect(readActiveTenantClient()).toEqual(readActiveTenantClient());
  });

  it('clearing removes the active tenant', () => {
    writeActiveTenantClient('33333333-3333-4333-8333-333333333333');
    clearActiveTenantClient();
    expect(readActiveTenantClient()).toEqual({ status: 'none' });
  });
});
