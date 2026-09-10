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
 */
import { cookies } from 'next/headers';

/** The cookie NextAuth writes. Read-only from this module's point of view. */
const SESSION_COOKIE = 'authjs.session-token';
const SECURE_SESSION_COOKIE = '__Secure-authjs.session-token';

export interface ApiSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
}

/**
 * The access token for server-side calls, or null when nobody is signed in.
 *
 * Returns null rather than throwing: an unauthenticated visitor is an ordinary
 * state on a public route, and the middleware — not this function — decides
 * whether that state is allowed here.
 */
export async function readAccessToken(): Promise<string | null> {
  const store = await cookies();
  const raw =
    store.get(SECURE_SESSION_COOKIE)?.value ?? store.get(SESSION_COOKIE)?.value ?? null;
  if (!raw) return null;

  // The cookie is NextAuth's encrypted JWE. Decoding it is `auth()`'s job, not
  // this module's; what lives here is the name and the absence-handling, so the
  // rest of the app has one place to change if the cookie name ever does.
  return raw;
}
