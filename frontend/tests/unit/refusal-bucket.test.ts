/**
 * T011 (extended by T038) — research.md D3: classifying a failed response's
 * (status, error.code) into a RefusalBucket.
 */
import { describe, expect, it } from 'vitest';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import type { FailedResponse } from '@/lib/api-client';

function failed(status: number, code: string, body: Record<string, unknown> = {}): FailedResponse {
  return { status, body: { error: { code, message: 'x' }, ...body } };
}

describe('classifyRefusal', () => {
  it('404 not_found classifies opaque', () => {
    expect(classifyRefusal(failed(404, 'not_found'))).toEqual({ bucket: 'opaque' });
  });

  it('403 mfa_enrollment_required classifies opaque (explicit override, research.md D3)', () => {
    expect(classifyRefusal(failed(403, 'mfa_enrollment_required'))).toEqual({ bucket: 'opaque' });
  });

  it('a network failure (no response) classifies opaque with no capability/limit fields', () => {
    expect(classifyRefusal(null)).toEqual({ bucket: 'opaque' });
  });

  it('403 not_authorized classifies role', () => {
    expect(classifyRefusal(failed(403, 'not_authorized'))).toEqual({ bucket: 'role' });
  });

  it('an unrecognised status/code pair classifies opaque rather than throwing', () => {
    expect(classifyRefusal(failed(500, 'internal_error'))).toEqual({ bucket: 'opaque' });
  });

  // T038 — US4: the two entitlement buckets.
  it('403 entitlement_required classifies entitlement-feature and carries the capability field', () => {
    const response = failed(403, 'entitlement_required', { capability: 'cases.export' });
    expect(classifyRefusal(response)).toEqual({ bucket: 'entitlement-feature', capability: 'cases.export' });
  });

  it('403 limit_reached classifies entitlement-limit and carries { key, value }', () => {
    const response = failed(403, 'limit_reached', { limit: { key: 'users', value: 25 } });
    expect(classifyRefusal(response)).toEqual({
      bucket: 'entitlement-limit',
      limit: { key: 'users', value: 25 },
    });
  });

  it('the two entitlement buckets are distinguishable from role and from each other', () => {
    const feature = classifyRefusal(failed(403, 'entitlement_required', { capability: 'x' }));
    const limit = classifyRefusal(failed(403, 'limit_reached', { limit: { key: 'users', value: 1 } }));
    const role = classifyRefusal(failed(403, 'not_authorized'));
    expect(feature.bucket).not.toBe(limit.bucket);
    expect(feature.bucket).not.toBe(role.bucket);
    expect(limit.bucket).not.toBe(role.bucket);
  });
});
