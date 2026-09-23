/**
 * The stale-cookie exit. Closes a redirect loop found in the browser on 2026-09-22.
 *
 * WHAT LOOPED. The root layout learned to redirect to `/ingresar` when the API refuses the
 * session behind a cookie. But the cookie was still there, and `proxy.ts` sends anybody who
 * HAS a cookie away from `/ingresar` and back to `/` ("Already signed in… send them
 * onward"). `/` → layout → `/ingresar` → proxy → `/` → … — a 307 loop the browser abandons
 * with a blank page. The layout's own comment claimed "the stale cookie is cleared on the
 * way through sign-in". Nothing cleared it.
 *
 * So the layout now redirects HERE, and this route's single job is to clear the cookie
 * before sending the person to sign in. It uses NextAuth's own `signOut` rather than
 * deleting cookies by name, because Auth.js splits a large session cookie into chunks
 * (`authjs.session-token.0`, `.1`, …) and a hand-written delete would miss them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn<(options?: unknown) => Promise<void>>();
vi.mock('@/auth', () => ({ signOut: (options?: unknown) => signOut(options) }));

import { GET } from '@/app/api/sesion/expirada/route';

describe('GET /api/sesion/expirada', () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue(undefined);
  });

  it('clears the NextAuth cookie through NextAuth itself', async () => {
    await GET();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('sends the person to sign in, marked as an expiry so the screen can say so', async () => {
    await GET();
    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({ redirectTo: '/ingresar?sesion=expirada' }),
    );
  });
});
