/**
 * T048 (016a), confirmed by T060 (019). A principal lacking the archetype for a
 * navigation item does not see it rendered; a direct call to that item's underlying
 * API route is refused all the same. `filterNavigationItems` never touches the network —
 * it cannot have made a route MORE reachable — and `004`'s `AuthorizationInterceptor` is
 * untouched by anything in `frontend/`.
 *
 * REWRITTEN 2026-10-09 against a real sign-in. The first version asserted an UNRECOGNISED
 * identity through an `x-identity-id` header against the backend directly. `003` retired that
 * mechanism: the backend now resolves the caller from the session, so a header-only request is
 * refused for having no session before any of the properties below can be observed, and the
 * suite had been skipped for want of the `principal.fixture.json` it read its tenant from.
 *
 * The property, stated with a real person: the demo firm's billing manager (`BM`) holds no case
 * capability at all (`matrix.ts`, 006/spec.md rows 29-33), so `Expedientes` is absent from their
 * navigation — and the case routes refuse them when called directly, through the very proxy the
 * screens use, with their real session. Hiding the item is cosmetic; the server is the gate.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo`, `E2E_BM_EMAIL` / `E2E_BM_SECRET`.
 */
import { test, expect, api, demoConfigured, DEMO_SKIP_REASON } from './demo-session';

test.use({ demoAs: 'billing' });
test.skip(!demoConfigured('billing'), DEMO_SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

test.describe('hiding a navigation item is cosmetic only', () => {
  test('the billing manager is not shown Expedientes', async ({ page }) => {
    await page.goto('/');
    const navigation = page.getByRole('navigation');
    await expect(navigation).toBeVisible();
    await expect(navigation.getByText('Expedientes')).toHaveCount(0);
  });

  test('the tenant-scoped route (case.read_list) refuses them anyway', async ({ page }) => {
    const as = await api(page);
    const response = await as.get('/tenant/cases');
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_authorized');
  });

  test('the assigned-scoped route (case.read) refuses them identically, whatever matter is named', async ({ page }) => {
    // Permission is decided before scope (004's refusal ordering): the refusal says nothing about
    // whether a matter with this id exists, because the server never got as far as asking.
    const as = await api(page);
    const [list, single] = await Promise.all([
      as.get('/tenant/cases'),
      as.get('/tenant/cases/22222222-2222-4222-8222-222222222222'),
    ]);
    expect(single.status()).toBe(list.status());
    expect(await single.json()).toEqual(await list.json());
  });
});
