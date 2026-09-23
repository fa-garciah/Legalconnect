/**
 * Carrying the session that enrollment already minted into NextAuth's cookie.
 *
 * THE DEFECT THIS CLOSES. `POST /auth/enrollment/confirm` returns a full session alongside
 * the backup codes — 003's quickstart states it as the acceptance bar for User Story 2:
 * "Expect 200 with exactly 10 backup codes and a session… Reach tenant data. The same
 * request that failed at step 3 now succeeds." `EnrollmentFlow` read the codes and
 * discarded the session, so there was no cookie, `proxy.ts` saw no session, and somebody
 * who had just enrolled a second factor was bounced to `/ingresar` to start over.
 *
 * WHY THE CONFIRM CALL IS NOT SIMPLY MOVED INTO `authorize()`. That is the obvious shape —
 * it is what the `legalconnect` provider does with `/auth/factor` — and it cannot work
 * here. `signIn()` resolves to ok-or-error and never returns the user object to its caller,
 * so the ten backup codes would be destroyed in the act of creating the session. They exist
 * exactly once, and no route returns them again to anyone (FR-024, FR-029). So the
 * component makes the confirm call, renders the codes, and hands only the session here.
 *
 * WHY TAKING THE TOKEN FROM THE PAGE IS SOUND. This does not believe the token. It PRESENTS
 * it to the API and keeps it only if the API resolves it against its own `session` table —
 * which is the same check every other request in the product undergoes (003/FR-034). A
 * forged, expired or revoked token fails and establishes nothing. And a script that already
 * holds a live access token has everything this could give it, so no capability is created.
 *
 * Exported as a plain function rather than inlined into `auth.ts` so it can be tested
 * without standing up NextAuth: the rules above are the kind that should fail a test when
 * broken, not be discovered in a browser.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface HandoffSession {
  readonly id: 'api-session';
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
}

export async function authorizeEnrollmentHandoff(
  raw: Record<string, unknown> | undefined,
): Promise<HandoffSession | null> {
  const accessToken = typeof raw?.accessToken === 'string' ? raw.accessToken : '';
  const refreshToken = typeof raw?.refreshToken === 'string' ? raw.refreshToken : '';
  const expiresAt = typeof raw?.expiresAt === 'string' ? raw.expiresAt : '';
  if (!accessToken || !refreshToken || !expiresAt) return null;

  /*
   * The verification. `/identity/memberships` is the right probe: it is the cheapest
   * authenticated route, it is the one `getPrincipal()` already calls on every render, and
   * it needs no tenant context — so a freshly enrolled identity that has not chosen a firm
   * yet still passes it.
   */
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/identity/memberships`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    // Unreachable API. Refusing is the only safe direction: a session must never be
    // created on the assumption that a token would have been accepted.
    return null;
  }

  if (!response.ok) return null;

  /*
   * Rebuilt field by field rather than spread from `raw`. Whatever else the caller passed —
   * the backup codes above all — must not travel into the JWT, and an explicit shape is the
   * only way to be sure of that as this object grows.
   */
  return { id: 'api-session', accessToken, refreshToken, expiresAt };
}
