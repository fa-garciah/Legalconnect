/**
 * T045 — US5, SC-006, SC-012. Loading, error and empty are visually distinguishable
 * from one another for the same region.
 *
 * WIRED 2026-10-09 against a real screen (`/clientes`) and the demo firm. Each state is produced
 * in the browser (`page.route`): a held response for loading, a 500 for error, an empty page for
 * empty — the same region, three times, and each time exactly one of the three is on screen with
 * its own structure. The component tier (`QueryBoundary.test.tsx`) already proves they are
 * mutually exclusive; this proves it in a real browser, on a real screen.
 */
import type { Page, Route } from '@playwright/test';
import { test, expect, demoConfigured, DEMO_SKIP_REASON } from './demo-session';

test.skip(!demoConfigured(), DEMO_SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

const STATES = ['loading-state', 'error-state', 'empty-state'] as const;

async function onlyThisState(page: Page, visible: (typeof STATES)[number]): Promise<void> {
  await expect(page.getByTestId(visible)).toBeVisible({ timeout: 15_000 });
  for (const other of STATES.filter((s) => s !== visible)) {
    await expect(page.getByTestId(other)).toHaveCount(0);
  }
}

test.describe('loading, error and empty are visually distinguishable', () => {
  test('the three states render distinct DOM structures for the same region', async ({ page }) => {
    const path = '**/api/lc/tenant/clients**';

    // LOADING — the response is held until the state has been observed.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(path, async (route: Route) => {
      await held;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) });
    });
    await page.goto('/clientes');
    await onlyThisState(page, 'loading-state');
    await expect(page.getByTestId('loading-state')).toHaveAttribute('role', 'status');
    release();

    // EMPTY — a successful response with zero records.
    await onlyThisState(page, 'empty-state');
    await page.unroute(path);

    // ERROR — a failed response, with the remedy the error state offers.
    await page.route(path, (route: Route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'simulated' } }),
      }),
    );
    await page.reload();
    await onlyThisState(page, 'error-state');
    await expect(page.getByTestId('error-state')).toHaveAttribute('role', 'alert');
    await expect(page.getByRole('button', { name: /reintentar/i })).toBeVisible();
  });
});
