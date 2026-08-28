/**
 * T048 (016a), confirmed by T060 (019). A principal lacking the archetype for a
 * navigation item does not see it rendered; a direct call to that item's underlying
 * API route is refused identically whether or not the item was ever hidden.
 * `filterNavigationItems` never touches the network — it cannot have made a route
 * MORE reachable — and `004`'s `AuthorizationInterceptor` is untouched by anything in
 * `frontend/`. This file used to be skipped: `016a` and `018` shipped no real
 * navigation item backed by a real capability to test against. `019` does.
 *
 * **The stronger case.** `expedientes` is gated by `case.read_list`, `tenant` scope —
 * the same kind `016a`'s placeholder imagined. `019` also ships an `assigned`-scoped
 * route, `GET /tenant/cases/:id`, reached by `case.read`. Scope kind changes nothing
 * about the guarantee under test: an unrecognised caller is refused by both, and both
 * refusals are the generic `404 not_found` — opaque, indistinguishable from the
 * resource simply not existing (`006/FR-016`–`FR-017`), which is a stronger claim
 * than a `403` would be, since it asserts the response discloses nothing at all.
 *
 * No seeded fixture identity is used here on purpose. Every real membership in this
 * product's seed (`dual`, `outsider`) either holds `case.read_list`/`case.read`
 * outright or is exempt from the `assigned` check entirely (`006`'s Decision 2, `MP`
 * and `SA`) — there is no seeded archetype this suite can point at that is guaranteed
 * to lack both capabilities on every run. A fabricated identity id is guaranteed to
 * hold neither, on any seed, which is the actual property this test needs: a caller
 * the server has never heard of, exactly as unauthenticated as an item being hidden
 * would suggest.
 */
import { test, expect } from '@playwright/test';
import fixture from '../../src/session/principal.fixture.json';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/** Well-formed, and guaranteed to name nobody — no `identity` row is ever seeded with it. */
const UNKNOWN_IDENTITY_ID = '00000000-0000-0000-0000-000000000000';

const TENANT_ID = fixture.memberships[0]?.tenantId ?? '';

test.describe('hiding a navigation item is cosmetic only', () => {
  test('the tenant-scoped route (case.read_list) refuses an unrecognised caller, same as a hidden item would', async ({
    request,
  }) => {
    test.skip(!TENANT_ID, 'principal.fixture.json has no seeded tenant to address');

    const response = await request.get(`${API_BASE}/tenant/cases`, {
      headers: { 'x-identity-id': UNKNOWN_IDENTITY_ID, 'x-tenant-id': TENANT_ID },
    });

    expect(response.status()).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  test('the assigned-scoped route (case.read) refuses an unrecognised caller identically — the stronger case', async ({
    request,
  }) => {
    test.skip(!TENANT_ID, 'principal.fixture.json has no seeded tenant to address');

    // Any well-formed uuid works: an unrecognised caller is refused before the server
    // ever reaches the question of whether a matter with this id exists (004's refusal
    // ordering) — so this is not a claim about which matter, only about who is asking.
    const response = await request.get(
      `${API_BASE}/tenant/cases/11111111-1111-4111-8111-111111111111`,
      { headers: { 'x-identity-id': UNKNOWN_IDENTITY_ID, 'x-tenant-id': TENANT_ID } },
    );

    expect(response.status()).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  test('both refusals are byte-identical in shape — no field distinguishes an unrecognised caller from a missing matter', async ({
    request,
  }) => {
    test.skip(!TENANT_ID, 'principal.fixture.json has no seeded tenant to address');

    const [listResponse, singleResponse] = await Promise.all([
      request.get(`${API_BASE}/tenant/cases`, {
        headers: { 'x-identity-id': UNKNOWN_IDENTITY_ID, 'x-tenant-id': TENANT_ID },
      }),
      request.get(`${API_BASE}/tenant/cases/22222222-2222-4222-8222-222222222222`, {
        headers: { 'x-identity-id': UNKNOWN_IDENTITY_ID, 'x-tenant-id': TENANT_ID },
      }),
    ]);

    expect(listResponse.status()).toBe(singleResponse.status());
    const [listBody, singleBody] = await Promise.all([listResponse.json(), singleResponse.json()]);
    expect(listBody).toEqual(singleBody);
  });
});
