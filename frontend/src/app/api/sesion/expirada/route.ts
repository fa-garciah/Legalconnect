/**
 * Where a person whose session has died is sent, so the cookie that outlived it is cleared.
 *
 * WHY THIS EXISTS. The root layout redirects to sign-in when the API refuses the session
 * behind a cookie (a revoked session, or one past `005`'s idle or 12-hour absolute limit).
 * Redirecting straight to `/ingresar` LOOPED: the cookie was still present, and `proxy.ts`
 * sends anybody holding one away from `/ingresar` and back to `/`. So `/` → `/ingresar` →
 * `/` → … until the browser gave up on a blank page. Found in the browser, 2026-09-22.
 *
 * This route sits between the two. `proxy.ts` lets it through (a cookie is present and it is
 * not a sign-in path), it clears the cookie, and only then does the person reach
 * `/ingresar` — where there is no longer anything to bounce them.
 *
 * NextAuth's own `signOut` does the clearing rather than a hand-written cookie delete:
 * Auth.js chunks a large session cookie into `authjs.session-token.0`, `.1`, …, and a delete
 * by name would leave the chunks behind and reproduce the loop.
 *
 * No server-side revocation is attempted. The session is already dead — that is the only way
 * to arrive here — so there is nothing left to revoke, and the credential needed to ask would
 * be the very one the API has just refused.
 */
import { signOut } from '@/auth';

export async function GET(): Promise<void> {
  await signOut({ redirectTo: '/ingresar?sesion=expirada' });
}
