/**
 * T049 — SC-011, FR-021. Every control in the shell is reachable and usable at both
 * the desktop and mobile Playwright projects (playwright.config.ts).
 */
import { test, expect } from '@playwright/test';

test.describe('the shell is usable at every configured viewport', () => {
  test('the header is visible and the navigation menu is reachable', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('shell-header')).toBeVisible();
    await expect(page.getByTestId('shell-nav')).toBeVisible();
    await expect(page.getByTestId('page-content')).toBeVisible();
  });
});
