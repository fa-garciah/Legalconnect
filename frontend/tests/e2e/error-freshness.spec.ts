/**
 * T040 — US4, spec.md User Story 4 scenario 9. An errored region issues a fresh
 * request when the person navigates away and back, rather than redisplaying the
 * stale error.
 *
 * WIRED 2026-10-09 against a real screen (`/clientes`, 018) and the demo firm. It was skipped
 * until a domain slice existed to drive it; several do now. The failure is made by the browser
 * (`page.route` answers the first clients request with a 500), so the backend stays untouched and
 * the test proves what the frontend does with an error — which is the whole claim.
 */
import { test, expect, demoConfigured, DEMO_SKIP_REASON } from './demo-session';

test.skip(!demoConfigured(), DEMO_SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

test.describe('error freshness', () => {
  test('navigating away and back re-attempts the request fresh', async ({ page }) => {
    let clientRequests = 0;
    let failNext = true;
    await page.route('**/api/lc/tenant/clients**', async (route) => {
      clientRequests += 1;
      if (failNext) {
        failNext = false;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'internal', message: 'simulated' } }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/clientes');
    await expect(page.getByTestId('error-state')).toBeVisible({ timeout: 15_000 });
    const afterError = clientRequests;

    // Away, and back — no retry button pressed.
    await page.getByRole('navigation').getByRole('link', { name: 'Expedientes' }).click();
    await expect(page).toHaveURL(/\/expedientes/);
    await page.getByRole('navigation').getByRole('link', { name: 'Clientes' }).click();
    await expect(page).toHaveURL(/\/clientes/);

    // A NEW request went out, and the region shows its result rather than the stale error.
    await expect(page.getByRole('article').first().or(page.getByTestId('empty-state'))).toBeVisible({ timeout: 15_000 });
    expect(clientRequests).toBeGreaterThan(afterError);
    await expect(page.getByTestId('error-state')).toHaveCount(0);
  });
});
