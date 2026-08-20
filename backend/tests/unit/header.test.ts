/**
 * `firstHeaderValue` collapses a repeated-header array to its first value. Node
 * collapses ordinary duplicate headers into one comma-joined string, so this
 * shape only appears for a handful of headers (`set-cookie` among them) — real
 * enough that the type allows it, rare enough that no HTTP-level test happens to
 * exercise it. Direct unit coverage is the honest way to close that.
 */
import { describe, expect, it } from 'vitest';
import { firstHeaderValue } from '../../src/common/http/header';

describe('firstHeaderValue', () => {
  it('returns a plain string value as-is', () => {
    expect(firstHeaderValue({ 'x-tenant-id': 'abc' }, 'x-tenant-id')).toBe('abc');
  });

  it('returns the first element when the header repeated into an array', () => {
    expect(firstHeaderValue({ 'x-tenant-id': ['first', 'second'] }, 'x-tenant-id')).toBe('first');
  });

  it('returns undefined when the header is absent', () => {
    expect(firstHeaderValue({}, 'x-tenant-id')).toBeUndefined();
  });

  it('returns undefined when the headers object itself is absent', () => {
    expect(firstHeaderValue(undefined, 'x-tenant-id')).toBeUndefined();
  });
});
