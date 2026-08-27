/**
 * T024 — US1, quickstart.md Scenario 1. The full shell in a real browser.
 */
import { test, expect } from '@playwright/test';

test.describe('shell render', () => {
  test('the shell renders with header, menu and content on the root route', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('shell-header')).toBeVisible();
  });
});
