/**
 * The sign-out action. `005-session-lifecycle`, US1 (`US08-EP12-ASC-SignOut`),
 * FR-003 to FR-006, contracts/session-lifecycle.md.
 *
 * WHAT MAKES THIS MORE THAN A COOKIE DELETE. 005's whole point is that sign-out is
 * server-side: the presented session's entire refresh-token family is revoked, so a
 * token captured before sign-out is refused afterward. Clearing NextAuth's cookie
 * alone would end the session only for the person's own browser and leave the API
 * credential live until its own expiry — which is the "discarded client-side"
 * behaviour US1's acceptance scenarios explicitly reject.
 *
 * ORDER IS LOAD-BEARING. The API call has to come FIRST, because NextAuth's
 * `signOut()` destroys the cookie the access token is decoded out of. Reverse the
 * two and there is nothing left to revoke with.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readAccessToken = vi.fn<() => Promise<string | null>>();
vi.mock('@/session/session-store', () => ({ readAccessToken: () => readAccessToken() }));

const nextAuthSignOut = vi.fn<(options?: unknown) => Promise<void>>();
vi.mock('@/auth', () => ({ signOut: (options?: unknown) => nextAuthSignOut(options) }));

import { signOutAction } from '@/session/sign-out';

describe('signOutAction', () => {
  beforeEach(() => {
    readAccessToken.mockReset();
    nextAuthSignOut.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('revokes the session at the API, presenting the access token as a bearer', async () => {
    readAccessToken.mockResolvedValue('the-api-access-token');

    await signOutAction();

    // The base URL is a module-level constant, the same shape `principal.ts` uses:
    // `NEXT_PUBLIC_` values are inlined at build time, so reading one per call would
    // suggest a runtime configurability that does not exist. Asserted against the
    // documented default rather than stubbed, so the test cannot pass on a value the
    // running application would never use.
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/auth/sign-out',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer the-api-access-token' }),
      }),
    );
  });

  it('revokes at the API BEFORE clearing the cookie the token lives in', async () => {
    readAccessToken.mockResolvedValue('token');
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        order.push('api');
        return Promise.resolve({ ok: true });
      }),
    );
    nextAuthSignOut.mockImplementation(() => {
      order.push('cookie');
      return Promise.resolve();
    });

    await signOutAction();

    expect(order).toEqual(['api', 'cookie']);
  });

  it('clears the cookie even when the API call fails — a network blip must not leave someone apparently signed in', async () => {
    readAccessToken.mockResolvedValue('token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(signOutAction()).resolves.toBeUndefined();
    expect(nextAuthSignOut).toHaveBeenCalled();
  });

  it('clears the cookie even when the API refuses', async () => {
    readAccessToken.mockResolvedValue('token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await signOutAction();

    expect(nextAuthSignOut).toHaveBeenCalled();
  });

  it('skips the API call when there is no token to revoke, and still clears the cookie', async () => {
    readAccessToken.mockResolvedValue(null);

    await signOutAction();

    expect(fetch).not.toHaveBeenCalled();
    expect(nextAuthSignOut).toHaveBeenCalled();
  });

  it('sends the person to the sign-in screen', async () => {
    readAccessToken.mockResolvedValue('token');

    await signOutAction();

    expect(nextAuthSignOut).toHaveBeenCalledWith(expect.objectContaining({ redirectTo: '/ingresar' }));
  });
});
