/**
 * Ending a session, for real. `005-session-lifecycle` US1 — `US08-EP12-ASC-SignOut`,
 * FR-003 to FR-006, contracts/session-lifecycle.md.
 *
 * A SERVER ACTION, NOT A CLIENT FETCH, and the reason is the same one that shapes
 * `session-store.ts`: the API's access token lives inside an httpOnly cookie that
 * script on the page cannot read (003/FR-051). A browser-side sign-out could delete
 * NextAuth's cookie but could never present the credential the API needs in order to
 * revoke anything — it would end the session for this browser and leave the token
 * live everywhere else until its own expiry. That is precisely the "discarded
 * client-side" behaviour US1's acceptance scenarios reject.
 *
 * ORDER IS LOAD-BEARING. The API call comes first, because NextAuth's `signOut()`
 * destroys the cookie the access token is decoded out of. Reversed, there would be
 * nothing left to revoke with — the session would stay live server-side and a token
 * captured beforehand would keep working, which is the exact failure US1 scenario 1
 * is written against.
 *
 * THE COOKIE IS CLEARED EVEN WHEN THE API CALL FAILS. A refused or unreachable API
 * must not strand somebody in a state where the screen still looks signed in: to the
 * person, "sign out" has to mean they are out. The server-side session then lapses on
 * its own idle/absolute limits (005 FR-007 to FR-011) rather than never. The opposite
 * default — refusing to sign out locally because the API did not answer — would make
 * a network blip look like the product ignoring them.
 */
'use server';

import { signOut } from '@/auth';
import { readAccessToken } from './session-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export async function signOutAction(): Promise<void> {
  const accessToken = await readAccessToken();

  if (accessToken) {
    try {
      // The contract answers 200 unconditionally, including against a session that
      // was already dead (FR-005) — so there is nothing to branch on and nothing
      // worth showing the person. The response is deliberately not inspected.
      await fetch(`${API_BASE_URL}/auth/sign-out`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
    } catch {
      // Unreachable API. Fall through to clearing the cookie — see the note above.
    }
  }

  await signOut({ redirectTo: '/ingresar' });
}
