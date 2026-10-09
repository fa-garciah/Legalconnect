/**
 * T024 — US1, quickstart.md Scenario 1. The full shell in a real browser.
 *
 * Signs in first, through `022`'s demo firm, with the one helper every signed-in suite shares
 * (`demo-session.ts`). Written before `003` gated the shell behind authentication, this test used
 * to visit `/` anonymously and look for the shell header — and found the sign-in page instead.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo`, and `E2E_SIGNIN_EMAIL` /
 * `E2E_SIGNIN_SECRET` / `E2E_SIGNIN_PASSWORD` for any demo person with a single firm.
 */
import { test, expect } from '@playwright/test';
import { E2E, SKIP_REASON } from './auth-helpers';
import { signIn } from './demo-session';

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);
// Desktop only, as every signed-in suite: the product refuses a TOTP code presented twice, so
// two projects signing the same person in within one 30-second step would refuse the second.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

test.describe('shell render', () => {
  test('the shell renders with header, menu and content on the root route', async ({ page }) => {
    await signIn(page);

    await page.goto('/');
    await expect(page.getByTestId('shell-header')).toBeVisible();
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.getByTestId('page-content')).toBeVisible();
  });
});
