/**
 * T007 — `getPrincipal()`. FR-023: this slice performs no authentication; the fixture
 * must look, to every consumer, exactly like whatever slice 003 will hand it.
 */
import { describe, expect, it } from 'vitest';
import { getPrincipal } from '@/session/principal';
import fixture from '@/session/principal.fixture.json';

describe('getPrincipal (fixture, research.md D5)', () => {
  it('returns the fixture identity and memberships unchanged', async () => {
    const principal = await getPrincipal();
    expect(principal.identityId).toBe(fixture.identityId);
    expect(principal.memberships).toEqual(fixture.memberships);
  });

  it('matches the Principal shape — identityId and a readonly memberships array', async () => {
    const principal = await getPrincipal();
    expect(typeof principal.identityId).toBe('string');
    expect(Array.isArray(principal.memberships)).toBe(true);
    for (const membership of principal.memberships) {
      expect(typeof membership.tenantId).toBe('string');
      expect(typeof membership.tenantName).toBe('string');
      expect(typeof membership.archetype).toBe('string');
    }
  });
});
