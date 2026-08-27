/**
 * T031 — US2, quickstart.md Scenario 2. Requires the backend dev server and seeded
 * data (a fixture identity holding 2 live memberships) — see quickstart.md
 * Prerequisites. Deferred to a full e2e pass once a real multi-tenant fixture wires
 * into `principal.fixture.json` or its slice-003 successor.
 */
import { test, expect } from '@playwright/test';

test.describe('tenant switch', () => {
  test.skip(true, 'requires a two-membership principal fixture — wired in the Polish pass, T052');

  test('switching reflects in the header within 2 seconds, with 0 records from the previous tenant', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('tenant-switcher').selectOption({ index: 1 });
    await expect(page.getByTestId('shell-header')).toBeVisible();
  });
});
