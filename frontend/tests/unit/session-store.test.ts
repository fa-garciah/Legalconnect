/**
 * The seam between NextAuth's cookie and the API's own access credential.
 *
 * WHY THIS FILE EXISTS. `principal.test.ts` mocks `readAccessToken` wholesale and
 * asserts what `getPrincipal()` does with whatever it returns. That is the right
 * shape for testing `principal.ts` — and it is exactly why nothing caught the
 * defect this file now guards: the one function nobody tested was the one that
 * decides WHAT the bearer token actually is.
 *
 * The contract, stated plainly: the cookie is NextAuth's encrypted JWE, and the
 * API's `SessionGuard` looks a presented bearer token up by
 * `digest(token) = session.access_digest`. The digest stored there is of the API's
 * OWN access token — the one `POST /auth/factor` returned and the `jwt` callback
 * put inside the JWE. Handing the API the JWE itself can never match that digest,
 * so every authenticated request 401s and `getPrincipal()` degrades to anonymous.
 *
 * The token therefore has to be decoded out of the cookie, server-side, and the
 * decoding must never move to the client: 003/FR-051 keeps the credential out of
 * browser storage, and a `session` callback that copied it into the session object
 * would publish it through `useSession()` and `/api/auth/session`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieStore.get(name);
        return value === undefined ? undefined : { name, value };
      },
    }),
}));

const decode = vi.fn<(params: { token: string; secret: string; salt: string }) => Promise<unknown>>();
vi.mock('next-auth/jwt', () => ({ decode: (params: never) => decode(params) }));

import { readAccessToken } from '@/session/session-store';

const PLAIN = 'authjs.session-token';
const SECURE = '__Secure-authjs.session-token';

describe('readAccessToken', () => {
  beforeEach(() => {
    cookieStore.clear();
    decode.mockReset();
    process.env.NEXTAUTH_SECRET = 'a-test-secret';
  });

  it('returns null when nobody is signed in', async () => {
    await expect(readAccessToken()).resolves.toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns the API access token carried inside the cookie, NOT the cookie itself', async () => {
    cookieStore.set(PLAIN, 'the-encrypted-jwe');
    decode.mockResolvedValue({ accessToken: 'the-api-access-token' });

    await expect(readAccessToken()).resolves.toBe('the-api-access-token');
    // The regression this file exists for: handing the API the raw cookie.
    await expect(readAccessToken()).resolves.not.toBe('the-encrypted-jwe');
  });

  it('decodes with the cookie name as the salt, which is what Auth.js derives the key from', async () => {
    cookieStore.set(PLAIN, 'the-encrypted-jwe');
    decode.mockResolvedValue({ accessToken: 'token' });

    await readAccessToken();

    expect(decode).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'the-encrypted-jwe', salt: PLAIN, secret: 'a-test-secret' }),
    );
  });

  it('prefers the __Secure- cookie and salts with that name when both are present', async () => {
    cookieStore.set(PLAIN, 'plain-jwe');
    cookieStore.set(SECURE, 'secure-jwe');
    decode.mockResolvedValue({ accessToken: 'token' });

    await readAccessToken();

    expect(decode).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'secure-jwe', salt: SECURE }),
    );
  });

  it('returns null when the cookie cannot be decoded — a tampered or stale-secret cookie is not a crash', async () => {
    cookieStore.set(PLAIN, 'tampered');
    decode.mockRejectedValue(new Error('decryption operation failed'));

    await expect(readAccessToken()).resolves.toBeNull();
  });

  it('returns null when the payload carries no access token', async () => {
    cookieStore.set(PLAIN, 'jwe-without-a-token');
    decode.mockResolvedValue({ sub: 'api-session' });

    await expect(readAccessToken()).resolves.toBeNull();
  });

  it('returns null rather than throwing when no secret is configured', async () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    cookieStore.set(PLAIN, 'the-encrypted-jwe');

    await expect(readAccessToken()).resolves.toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });
});
