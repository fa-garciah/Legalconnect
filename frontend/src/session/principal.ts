/**
 * T056 — the principal, read from a real session.
 *
 * `016a` shipped this file as ONE function backed by a checked-in fixture, and
 * documented it as replaceable wholesale by slice 003 (016a/research.md D5,
 * FR-023). That is what this is: one file replaced, the fixture deleted, and
 * `types.ts` untouched.
 *
 * THE SHAPE IS UNCHANGED, DELIBERATELY. Six slices now stand on `getPrincipal()`
 * — `016a`, `006`, `007`, `017`, `018`, `019` — across eighteen referencing
 * files. Every one of them depends on this function's shape and none on where it
 * gets its answer, which is precisely the seam `016a` built and the reason this
 * slice needs no amendment to any of them (FR-047, FR-048, SC-024, SC-025).
 *
 * WHY THE MEMBERSHIPS COME FROM THE API AND NOT FROM THE SESSION. The session
 * carries no tenant and no archetype at all (FR-037): both are resolved per
 * request from `membership` under RLS, and nothing in the session is ever
 * trusted as their source (002/FR-016). So this asks `002`'s
 * enumerate-own-memberships route, which answers from the database with the
 * caller's real, live memberships. A session that carried them would be a token
 * carrying authorization, which is the thing the identity/membership separation
 * exists to prevent.
 */
import { readAccessToken } from './session-store';
import type { Principal } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Nobody signed in. A shape, not a throw — see the note in session-store.ts.
 *
 * `authenticated: false` is the load-bearing field. It used to be inferable only from an
 * empty `memberships`, which is ALSO what a signed-in identity belonging to no firm looks
 * like (002/FR-011) — and the shell rendered the same dead end for both: no navigation, no
 * firm to choose, and no sign-out control, because the rail that holds it was not drawn.
 * Somebody whose session had expired could neither get in nor get out.
 */
const ANONYMOUS: Principal = { authenticated: false, identityId: '', memberships: [] };

interface MembershipsResponse {
  readonly identityId?: string;
  readonly items?: readonly {
    readonly tenantId: string;
    readonly tenantName: string;
    readonly archetype: Principal['memberships'][number]['archetype'];
  }[];
}

export async function getPrincipal(): Promise<Principal> {
  const accessToken = await readAccessToken();
  if (!accessToken) return ANONYMOUS;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/identity/memberships`, {
      headers: { authorization: `Bearer ${accessToken}` },
      // Never cached. A revoked membership must stop appearing on the NEXT
      // request, which is the whole point of validating against session state
      // rather than against a token's expiry.
      cache: 'no-store',
    });
  } catch {
    return ANONYMOUS;
  }

  if (!response.ok) return ANONYMOUS;

  const body = (await response.json()) as MembershipsResponse;
  return {
    // The API answered, so the session it resolved is live. Everything below is what that
    // session is entitled to see — possibly nothing, which is a valid state and not the
    // same as not being signed in.
    authenticated: true,
    identityId: body.identityId ?? '',
    memberships: body.items ?? [],
  };
}
