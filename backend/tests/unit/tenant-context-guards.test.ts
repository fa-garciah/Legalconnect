/**
 * `currentTx` and `currentPrincipal` throw rather than returning undefined when
 * called with no tenant context active — the loud version of a bug that would
 * otherwise surface as a much quieter one (a handler reading past the middleware
 * without a transaction). Nothing exercised the "called outside any context" case
 * directly before this, since every other test runs inside `runInTenantContext`.
 */
import { describe, expect, it } from 'vitest';
import { currentPrincipal, currentTx } from '../../src/common/tenant/middleware';

describe('currentTx / currentPrincipal outside any active context', () => {
  it('currentTx throws rather than returning undefined', () => {
    expect(() => currentTx()).toThrow(/no tenant context is active/i);
  });

  it('currentPrincipal throws rather than returning undefined', () => {
    expect(() => currentPrincipal()).toThrow(/no tenant context is active/i);
  });
});
