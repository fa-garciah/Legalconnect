/**
 * T008 — the refusal vocabulary's wire mapping. contracts/refusal.md §2. FR-006,
 * FR-017, FR-022, FR-024.
 */
import { describe, expect, it } from 'vitest';
import { REFUSAL_ORDER, refusalToHttp, type Decision } from '../../src/common/authz/refusal';

function body(decision: Decision, scopeKind?: Parameters<typeof refusalToHttp>[1]) {
  const exception = refusalToHttp(decision as Extract<Decision, { permitted: false }>, scopeKind);
  return { status: exception.getStatus(), response: exception.getResponse() as Record<string, unknown> };
}

describe('REFUSAL_ORDER', () => {
  it('is exactly the four reasons, in this order', () => {
    expect(REFUSAL_ORDER).toEqual(['mfa_not_enrolled', 'permission', 'scope', 'entitlement']);
  });
});

describe('refusalToHttp — wire mapping', () => {
  it('mfa_not_enrolled -> 403 mfa_enrollment_required', () => {
    const { status, response } = body({ permitted: false, reason: 'mfa_not_enrolled' });
    expect(status).toBe(403);
    expect((response.error as { code: string }).code).toBe('mfa_enrollment_required');
  });

  it('permission -> 403 not_authorized', () => {
    const { status, response } = body({ permitted: false, reason: 'permission' });
    expect(status).toBe(403);
    expect((response.error as { code: string }).code).toBe('not_authorized');
  });

  it('scope, kind self -> 403 not_authorized', () => {
    const { status, response } = body({ permitted: false, reason: 'scope' }, 'self');
    expect(status).toBe(403);
    expect((response.error as { code: string }).code).toBe('not_authorized');
  });

  it('scope, kind assigned -> 404 not_found (provisional, research.md D6)', () => {
    const { status, response } = body({ permitted: false, reason: 'scope' }, 'assigned');
    expect(status).toBe(404);
    expect((response.error as { code: string }).code).toBe('not_found');
  });

  it('entitlement, feature flag -> 403 entitlement_required, carries capability', () => {
    const { status, response } = body({
      permitted: false,
      reason: 'entitlement',
      capability: 'audit.read_own_tenant',
    });
    expect(status).toBe(403);
    expect((response.error as { code: string }).code).toBe('entitlement_required');
    expect(response.capability).toBe('audit.read_own_tenant');
  });

  it('entitlement, quantitative limit -> 403 limit_reached, carries limit: { key, value }', () => {
    const { status, response } = body({
      permitted: false,
      reason: 'entitlement',
      limit: { key: 'users', value: 25 },
    });
    expect(status).toBe(403);
    expect((response.error as { code: string }).code).toBe('limit_reached');
    expect(response.limit).toEqual({ key: 'users', value: 25 });
  });
});
