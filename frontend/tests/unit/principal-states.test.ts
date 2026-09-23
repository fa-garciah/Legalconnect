/**
 * Three states that were one, and the dead end that resulted from collapsing them.
 *
 * WHAT HAPPENED. `getPrincipal()` returned `{ identityId: '', memberships: [] }` for BOTH
 * "nobody is signed in" and "signed in, belongs to no firm". `Shell` then rendered the same
 * screen for those and for a third, genuinely different case — "signed in, belongs to
 * several firms, has not picked one" — and rendered it WITHOUT the shell around it.
 *
 * So somebody whose session had expired saw "No tienes un contexto de tenant activo.
 * Selecciona una firma para continuar", with no firm to select, no navigation, and NO
 * SIGN-OUT CONTROL, because the sign-out control lives in the rail that was not drawn.
 * They could not get in and could not get out. `proxy.ts` did not catch it either: it
 * checks that the cookie EXISTS, never that the session behind it is alive — which its own
 * comment says outright ("THIS IS CONVENIENCE, NOT ENFORCEMENT").
 *
 * 002/FR-011 makes "signed in with zero memberships" a legitimate, permanent state, so
 * conflating it with an expired session is a real loss of meaning and not a shortcut.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readAccessToken = vi.fn<() => Promise<string | null>>();
vi.mock('@/session/session-store', () => ({ readAccessToken: () => readAccessToken() }));

import { getPrincipal } from '@/session/principal';

const upstream = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('getPrincipal distinguishes the three states', () => {
  beforeEach(() => {
    readAccessToken.mockReset();
    upstream.mockReset();
    vi.stubGlobal('fetch', upstream);
  });

  it('no cookie at all: not authenticated', async () => {
    readAccessToken.mockResolvedValue(null);

    const principal = await getPrincipal();

    expect(principal.authenticated).toBe(false);
    expect(principal.memberships).toEqual([]);
  });

  it('a cookie whose session the API refuses: NOT authenticated, not merely empty', async () => {
    // The expired-session case that produced the dead end. The cookie is present, so
    // `proxy.ts` lets the navigation through; only this answer can tell the layout to
    // send them back to sign in.
    readAccessToken.mockResolvedValue('a-stale-token');
    upstream.mockResolvedValue(json({ error: { code: 'unauthenticated' } }, 401));

    const principal = await getPrincipal();

    expect(principal.authenticated).toBe(false);
  });

  it('the API is unreachable: not authenticated rather than a crash', async () => {
    readAccessToken.mockResolvedValue('a-token');
    upstream.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(getPrincipal()).resolves.toMatchObject({ authenticated: false });
  });

  it('signed in with no firm: AUTHENTICATED and empty — 002/FR-011 makes this valid', async () => {
    readAccessToken.mockResolvedValue('a-live-token');
    upstream.mockResolvedValue(json({ identityId: 'identity-1', items: [] }));

    const principal = await getPrincipal();

    expect(principal.authenticated).toBe(true);
    expect(principal.identityId).toBe('identity-1');
    expect(principal.memberships).toEqual([]);
  });

  it('signed in with firms: authenticated, and each firm carries its name', async () => {
    readAccessToken.mockResolvedValue('a-live-token');
    upstream.mockResolvedValue(
      json({
        identityId: 'identity-1',
        items: [{ tenantId: 'tenant-a', tenantName: 'Despacho Alfa, S.C.', archetype: 'MP' }],
      }),
    );

    const principal = await getPrincipal();

    expect(principal.authenticated).toBe(true);
    expect(principal.memberships[0]?.tenantName).toBe('Despacho Alfa, S.C.');
  });

  it('keeps the shape six slices already depend on', async () => {
    // `016a`, `006`, `007`, `017`, `018` and `019` read `identityId` and `memberships`
    // across eighteen files. `authenticated` is ADDED beside them; nothing is renamed.
    readAccessToken.mockResolvedValue('a-live-token');
    upstream.mockResolvedValue(json({ identityId: 'identity-1', items: [] }));

    const principal = await getPrincipal();

    expect(principal).toHaveProperty('identityId');
    expect(principal).toHaveProperty('memberships');
  });
});
