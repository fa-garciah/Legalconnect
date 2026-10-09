/**
 * T031 — US2, quickstart.md Scenario 2. Switching firm reflects in the header within 2 seconds,
 * with 0 records from the previous firm on screen.
 *
 * WIRED 2026-10-09 against `022`'s demo, which seeds exactly the fixture this needed: one person,
 * Laura Ramírez, with a live membership in BOTH demo firms — AA at Despacho Méndez, MP at Bufete
 * Ríos (001/FR-021). The two firms' client lists share no name (`demo/clients.ts`), so "nothing
 * from the previous firm" is a checkable claim rather than a hope.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo`, and `E2E_DUAL_EMAIL` /
 * `E2E_DUAL_SECRET` set to her (`laura.ramirez@demo.legalconnect.mx`).
 */
import { test, expect, demoConfigured, DEMO_SKIP_REASON } from './demo-session';

test.use({ demoAs: 'dual' });
test.skip(!demoConfigured('dual'), DEMO_SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

test.describe('tenant switch', () => {
  test('switching reflects in the header within 2 seconds, with 0 records from the previous tenant', async ({ page }) => {
    await page.goto('/clientes');
    const switcher = page.getByTestId('tenant-switcher');
    await expect(switcher).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15_000 });

    const before = await switcher.inputValue();
    const namesBefore = await page.getByRole('article').getByRole('heading').allTextContents();
    expect(namesBefore.length).toBeGreaterThan(0);

    const other = await switcher.locator('option').evaluateAll(
      (options, current) => (options as HTMLOptionElement[]).map((o) => o.value).find((v) => v && v !== current),
      before,
    );
    expect(other, 'the dual-firm person has a second firm to switch to').toBeTruthy();

    const started = Date.now();
    await switcher.selectOption(other!);
    await expect(switcher).toHaveValue(other!, { timeout: 2_000 });
    expect(Date.now() - started).toBeLessThanOrEqual(2_000);

    await page.goto('/clientes');
    await expect(page.getByRole('article').first().or(page.getByTestId('empty-state'))).toBeVisible({ timeout: 15_000 });
    const namesAfter = await page.getByRole('article').getByRole('heading').allTextContents();
    expect(namesAfter.filter((name) => namesBefore.includes(name))).toEqual([]);
  });
});
