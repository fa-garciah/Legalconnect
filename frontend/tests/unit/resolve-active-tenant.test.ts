/**
 * Which firm the shell opens in. Found in the browser on 2026-09-22.
 *
 * WHAT WENT WRONG. The active firm is remembered in a 30-day cookie. When the local database
 * was re-seeded, every tenant id changed, but the cookie still named the old one. The shell
 * trusted it without checking it against the person's memberships, found no membership for
 * it, and showed "Perteneces a más de una firma" to somebody who belongs to exactly one —
 * with no switcher, because the switcher correctly hides itself below two firms.
 *
 * The same thing happens in production for a revoked membership: the cookie outlives it.
 * A remembered choice is a preference, never an authority; it is honoured only when it
 * still names a firm the person belongs to.
 */
import { describe, expect, it } from 'vitest';
import { resolveActiveTenant } from '@/shell/resolve-active-tenant';
import type { Principal } from '@/session/types';

const A = { tenantId: 'tenant-a', tenantName: 'Despacho Alfa, S.C.', archetype: 'MP' } as const;
const B = { tenantId: 'tenant-b', tenantName: 'Bufete Beta, S.C.', archetype: 'AA' } as const;

function principal(memberships: Principal['memberships']): Principal {
  return { authenticated: true, identityId: 'identity-1', memberships };
}

describe('resolveActiveTenant', () => {
  it('one firm and no remembered choice: enters it directly', () => {
    expect(resolveActiveTenant({ status: 'none' }, principal([A]))).toEqual({
      status: 'active',
      tenantId: 'tenant-a',
    });
  });

  it('one firm and a STALE remembered choice: ignores the cookie and enters the firm', () => {
    // The exact defect: a cookie naming a tenant id from an earlier seed.
    expect(
      resolveActiveTenant({ status: 'active', tenantId: 'a-tenant-that-no-longer-exists' }, principal([A])),
    ).toEqual({ status: 'active', tenantId: 'tenant-a' });
  });

  it('several firms and a valid remembered choice: honours it', () => {
    expect(resolveActiveTenant({ status: 'active', tenantId: 'tenant-b' }, principal([A, B]))).toEqual({
      status: 'active',
      tenantId: 'tenant-b',
    });
  });

  it('several firms and a stale remembered choice: asks, rather than guessing', () => {
    // Auto-picking one of several is the wrong-firm-that-looks-right failure 016a warns of.
    expect(
      resolveActiveTenant({ status: 'active', tenantId: 'revoked-membership' }, principal([A, B])),
    ).toEqual({ status: 'none' });
  });

  it('several firms and no remembered choice: asks', () => {
    expect(resolveActiveTenant({ status: 'none' }, principal([A, B]))).toEqual({ status: 'none' });
  });

  it('no firms: none, whatever the cookie says', () => {
    expect(resolveActiveTenant({ status: 'active', tenantId: 'tenant-a' }, principal([]))).toEqual({
      status: 'none',
    });
  });
});
