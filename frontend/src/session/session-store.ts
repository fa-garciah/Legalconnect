/**
 * Where the browser keeps the API's access credential. 003/D1.
 *
 * NEXTAUTH IS TRANSPORT, NOT AUTHORITY. It conducts the browser side of the
 * ceremony and holds the resulting cookie; it verifies nothing, has no database
 * adapter and no session strategy of its own. The API's `session` table is the
 * only session store, and every API request re-validates against it (FR-034).
 *
 * The reason is in the constitution rather than in taste: the API "MUST validate
 * every request against this product's own session state, never against a bearer
 * token's signature and expiry alone." Letting NextAuth hold its own notion of
 * validity alongside the product's would recreate exactly the divergence the
 * v1.5.0 amendment claims self-hosting removes — except this time the second
 * system would be one we built.
 *
 * NOTHING HERE TOUCHES localStorage, sessionStorage OR IndexedDB (FR-051). The
 * credential lives in an httpOnly cookie NextAuth manages, so script running on
 * the page cannot read it, which is the property browser storage cannot offer.
 *
 * ---------------------------------------------------------------------------
 * THE COOKIE IS NOT THE TOKEN, AND RETURNING IT AS ONE WAS A DEFECT.
 *
 * This module previously returned the cookie's raw value and `principal.ts` sent
 * that to the API as `Bearer <value>`. The cookie is an ENCRYPTED JWE; the API's
 * `SessionGuard` resolves a bearer token by `digest(token) = session.access_digest`,
 * and the digest stored there is of the API's OWN access token — the one
 * `POST /auth/factor` returned and `auth.ts`'s `jwt` callback placed INSIDE the
 * JWE. A JWE can never hash to that digest, so every authenticated request
 * answered 401 and `getPrincipal()` degraded to anonymous: a signed-in person
 * reached the shell and was told they had no active tenant.
 *
 * Nothing caught it because the only test of this seam mocked this function away.
 * `tests/unit/session-store.test.ts` now covers it directly.
 *
 * WHY `decode()` HERE RATHER THAN `auth()` OR A `session` CALLBACK. Auth.js v5
 * would happily surface the token through `auth()` if `auth.ts`'s `session`
 * callback copied it onto the session object — and that is precisely what must not
 * happen. The session object is also what `useSession()` and `/api/auth/session`
 * return, so copying it there publishes the API credential to any script on the
 * page and undoes FR-051. Decoding it in this server-only module keeps the
 * credential on the server, which is where the httpOnly cookie was already keeping
 * it.
 * ---------------------------------------------------------------------------
 */
import { cookies } from 'next/headers';
import { decode } from 'next-auth/jwt';

/** The cookie NextAuth writes. Read-only from this module's point of view. */
const SESSION_COOKIE = 'authjs.session-token';
const SECURE_SESSION_COOKIE = '__Secure-authjs.session-token';

export interface ApiSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
}

/**
 * Auth.js derives the JWE's encryption key from the secret AND the cookie name,
 * so decoding a `__Secure-`-prefixed cookie with the unprefixed name as salt
 * fails just as surely as using the wrong secret. The name that carried the
 * value is therefore the name it is decoded with.
 */
interface PresentedCookie {
  readonly token: string;
  readonly salt: string;
}

async function presentedCookie(): Promise<PresentedCookie | null> {
  const store = await cookies();
  const secure = store.get(SECURE_SESSION_COOKIE)?.value;
  if (secure) return { token: secure, salt: SECURE_SESSION_COOKIE };
  const plain = store.get(SESSION_COOKIE)?.value;
  if (plain) return { token: plain, salt: SESSION_COOKIE };
  return null;
}

/**
 * `AUTH_SECRET` is the v5 name and `NEXTAUTH_SECRET` the v4 one. Auth.js itself
 * still reads both, and `.env.example` documents the latter, so both are accepted
 * here rather than silently failing against a correctly-configured environment.
 */
function sessionSecret(): string | null {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? null;
}

/**
 * The access token for server-side calls, or null when nobody is signed in.
 *
 * Returns null rather than throwing in every failure mode — absent cookie, absent
 * secret, undecodable cookie, payload without a token. An unauthenticated visitor
 * is an ordinary state on a public route, and a cookie this server cannot decode
 * (tampered, or encrypted under a rotated secret) means exactly the same thing to
 * the caller as no cookie at all: nobody is signed in. `proxy.ts` — not this
 * function — decides whether that state is allowed on the requested path.
 */
export async function readAccessToken(): Promise<string | null> {
  const presented = await presentedCookie();
  if (!presented) return null;

  const secret = sessionSecret();
  if (!secret) return null;

  let claims: Partial<ApiSession> | null;
  try {
    claims = await decode<Partial<ApiSession>>({
      token: presented.token,
      secret,
      salt: presented.salt,
    });
  } catch {
    return null;
  }

  return typeof claims?.accessToken === 'string' && claims.accessToken.length > 0
    ? claims.accessToken
    : null;
}
