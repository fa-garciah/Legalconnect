/**
 * The enrollment handoff. Closes the defect found by running the product on 2026-09-21.
 *
 * WHAT WAS BROKEN. `POST /auth/enrollment/confirm` returns
 * `{ backupCodes, accessToken, refreshToken, expiresAt }` — a full session, exactly as
 * 003's quickstart says it must ("Expect 200 with exactly 10 backup codes and a session").
 * `EnrollmentFlow` read `backupCodes` and threw the other three away, then called
 * `router.push('/')`. With no cookie for NextAuth to hold, `proxy.ts` saw no session and
 * bounced the person straight back to `/ingresar`. Somebody who had just enrolled a second
 * factor was told to sign in again, with no explanation.
 *
 * WHY A SEPARATE PROVIDER RATHER THAN MOVING THE CALL INTO `authorize()`. The obvious fix
 * is to have the Credentials provider make the confirm call itself, the way `legalconnect`
 * calls `/auth/factor`. It does not work: `signIn()` resolves to ok-or-error and never
 * hands the caller the user object, so the ten backup codes — which exist exactly once and
 * are never retrievable again (FR-024, FR-029) — would be destroyed in the act of
 * establishing the session.
 *
 * WHY ACCEPTING THE TOKEN FROM THE PAGE IS NOT A HOLE. `authorize()` does not believe the
 * token; it PRESENTS it to the API and keeps it only if the API resolves it against its own
 * `session` table. A forged or expired token fails that check and no session is created.
 * And a script that already holds a live access token has everything this would give it, so
 * nothing new is reachable. What the handoff does NOT do is let the token be read back: it
 * goes into the encrypted httpOnly cookie, and `session-store.ts` is the only thing that
 * ever decodes it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeEnrollmentHandoff } from '@/session/enrollment-handoff';

const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

describe('authorizeEnrollmentHandoff', () => {
  beforeEach(() => {
    upstream.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
  });

  it('keeps a session whose token the API resolves', async () => {
    const result = await authorizeEnrollmentHandoff({
      accessToken: 'a-live-token',
      refreshToken: 'a-refresh-token',
      expiresAt: '2026-09-22T12:00:00Z',
    });

    expect(result).toEqual({
      id: 'api-session',
      accessToken: 'a-live-token',
      refreshToken: 'a-refresh-token',
      expiresAt: '2026-09-22T12:00:00Z',
    });
  });

  it('VERIFIES the token against the API rather than believing the page', async () => {
    await authorizeEnrollmentHandoff({
      accessToken: 'a-live-token',
      refreshToken: 'r',
      expiresAt: 'e',
    });

    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toContain('/identity/memberships');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer a-live-token');
  });

  it('refuses a token the API does not resolve — a forged one establishes nothing', async () => {
    upstream.mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(
      authorizeEnrollmentHandoff({ accessToken: 'forged', refreshToken: 'r', expiresAt: 'e' }),
    ).resolves.toBeNull();
  });

  it('refuses when the API cannot be reached — it never assumes success', async () => {
    upstream.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      authorizeEnrollmentHandoff({ accessToken: 'a-live-token', refreshToken: 'r', expiresAt: 'e' }),
    ).resolves.toBeNull();
  });

  it('refuses an absent or non-string token without calling the API', async () => {
    await expect(authorizeEnrollmentHandoff({})).resolves.toBeNull();
    await expect(
      authorizeEnrollmentHandoff({ accessToken: 42, refreshToken: 'r', expiresAt: 'e' }),
    ).resolves.toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });

  it('carries no backup code, however the caller passes one', async () => {
    // The ten codes exist once and are never retrievable (FR-024, FR-029). They are shown
    // on screen and must not enter the session cookie by any route, including this one.
    const result = await authorizeEnrollmentHandoff({
      accessToken: 'a-live-token',
      refreshToken: 'r',
      expiresAt: 'e',
      backupCodes: ['WZYHB-Z0WDR', 'X1T86-9C583'],
    });

    expect(JSON.stringify(result)).not.toContain('WZYHB');
    expect(result).not.toHaveProperty('backupCodes');
  });
});
