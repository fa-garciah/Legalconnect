/**
 * 008 T024 — the billing manager, who holds no case capability (006, Principle VI), gets the
 * no-access copy on a notes page and the page sends no notes request.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo`, `E2E_BM_*`. One sign-in.
 */
import { test, expect, demoConfigured, DEMO_SKIP_REASON } from './demo-session';

test.use({ demoAs: 'billing' });
test.skip(!demoConfigured('billing'), DEMO_SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

test.describe('the billing manager', () => {
  test('gets the no-access copy on a notes page, and no notes request is made', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/notes')) requests.push(r.url());
    });
    await page.goto('/expedientes/00000000-0000-4000-8000-000000000001/notas');
    await expect(page.getByText('Tu rol no consulta las notas de los expedientes.')).toBeVisible();
    expect(requests).toEqual([]);
  });
});
