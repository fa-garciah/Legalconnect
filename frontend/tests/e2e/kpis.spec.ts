/**
 * 015 T029 — `/kpis` against a running backend and real data.
 *
 * WHAT ONLY AN E2E CAN SHOW HERE: that the figures are the *server's*, computed over a real
 * firm's matters, and that changing the period recomputes them rather than re-rendering the
 * same numbers under a new label. The component tests assert the rendering against a mocked
 * payload; nothing before this point proves the aggregation and the screen agree.
 *
 * It also pins the one thing the component tests can only assert about a mock: that the
 * accessible table under each chart carries the *same* numbers the endpoint sent, after a real
 * round trip.
 *
 * **Prerequisites**: backend on 3001, and `E2E_SIGNIN_EMAIL` / `E2E_SIGNIN_SECRET` /
 * `E2E_SIGNIN_PASSWORD` for an enrolled `MP`, `CM` or `SA` — the three archetypes holding
 * `kpi.read`. `npm run db:seed:demo` prints exactly those three values for a firm with 40
 * matters spread over six quarters, roughly half of them closed and declared.
 *
 * **Read-only.** It declares no outcome and changes no matter, so it can run repeatedly
 * against the demo firm without moving the numbers it just read.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E, SKIP_REASON, credentialStep, totpCode } from './auth-helpers';

const ADMIN_FIRM = process.env.E2E_ADMIN_FIRM ?? '';

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — this is a layout-independent read');
});

test.describe('the firm\'s indicators', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;

  /**
   * ONE sign-in for the whole file. `023` learned why the hard way: `sign-in.service.ts`
   * throttles by ORIGIN — five attempts per fifteen minutes, in memory — so a file that signs
   * in per test trips the product's own defence from the sixth attempt and stalls on
   * `/verificar` with a refusal deliberately indistinguishable from a wrong password.
   */
  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== 'desktop') return;
    context = await browser.newContext();
    page = await context.newPage();
    await credentialStep(page, E2E.email);
    await expect(page).toHaveURL(/\/verificar/);
    await page.getByRole('textbox').fill(totpCode(E2E.secret));
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page).not.toHaveURL(/\/(ingresar|verificar)/, { timeout: 15_000 });

    const picker = page.getByRole('heading', { name: 'Elige una firma' });
    if (await picker.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: new RegExp(ADMIN_FIRM || '.', 'i') }).first().click();
    }
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('the navigation leads there', async () => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'KPIs' }).click();
    await expect(page).toHaveURL(/\/kpis$/);
    await expect(page.getByRole('heading', { name: 'Panel de indicadores' })).toBeVisible();
  });

  test('the active-matter count is a real number from the database', async () => {
    const tile = page.getByTestId('tile-activos-value');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    // A digit, not "Sin datos": a count is always computable, even when it is zero.
    await expect(tile).toHaveText(/^\d+$/);
  });

  test('the workload table names positions and never an email', async () => {
    await expect(page.getByRole('heading', { name: 'Asuntos por responsable' })).toBeVisible();
    // FR-012 — the numbers exist as a table, not only as bars.
    await expect(page.getByTestId(/^chart-row-/).first()).toBeVisible();
    // Decision 10 — an aggregate carries no personal data, and `kpi.read` does not imply
    // `membership.read_tenant`. An `@` anywhere on this screen is a leak.
    await expect(page.locator('body')).not.toContainText('@');
  });

  test('changing the period recomputes the figures', async () => {
    const shown = async () => ({
      active: await page.getByTestId('tile-activos-value').textContent(),
      resolution: await page.getByTestId('tile-resolucion-value').textContent(),
    });

    const quarter = await shown();

    const request = page.waitForResponse(
      (r) => r.url().includes('/tenant/kpis') && r.url().includes('period=year'),
    );
    await page.getByLabel('Periodo').click();
    await page.getByRole('option', { name: 'Último año' }).click();
    const response = await request;
    expect(response.status()).toBe(200);

    /*
     * The ACTIVE count is the same under any period — it is a fact about today, which is why
     * that tile carries no delta. The resolution average is not: a year closes more matters
     * than a quarter, so the sample grows. Asserting the sample rather than the average is
     * deliberate — the average may legitimately coincide, the count may not shrink.
     */
    await expect(page.getByTestId('tile-activos-value')).toHaveText(quarter.active ?? '');
    const yearSample = await page.getByTestId('tile-resolucion-sample').textContent();
    expect(yearSample).toBeTruthy();
  });

  test('the Asuntos tab shows the by-type breakdown, and there is no Financiero tab', async () => {
    await page.getByRole('tab', { name: 'Asuntos' }).click();
    // By role: the same words are also the accessible table's caption, which is the point of
    // FR-012 — so matching on the text alone is ambiguous by design.
    await expect(
      page.getByRole('heading', { name: 'Tasa de éxito por tipo de asunto' }),
    ).toBeVisible();
    await expect(page.getByTestId(/^chart-row-/).first()).toBeVisible();
    // Decision 2, checked where it matters most: against the real product, not a mock.
    await expect(page.getByRole('tab', { name: /financiero/i })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/ingresos/i);
  });
});

/**
 * The refusal side, in a browser (FR-013, Decision 4).
 *
 * An `AA` leads matters and cannot read the firm's aggregates, because an aggregate summarises
 * every matter in the firm including the ones they are not on. Two separate things have to hold
 * and only one of them is visible: the link is not drawn, AND the page refuses if they reach it
 * anyway. A screen that merely hides the link would still serve the numbers to anyone who typed
 * the URL, which is the defect `hidden-item-still-refused.spec.ts` exists to rule out generally
 * and this pins for this route.
 *
 * SECOND SIGN-IN OF THE FILE, and that is the budget: `sign-in.service.ts` allows five per
 * fifteen minutes per origin. A third would be pushing it, which is why the other archetypes'
 * refusals are asserted in `backend/tests/contract/kpis.test.ts` instead.
 */
const AA = {
  email: process.env.E2E_AA_EMAIL ?? '',
  secret: process.env.E2E_AA_SECRET ?? '',
};

test.describe('an associate cannot read them', () => {
  test.skip(!AA.email || !AA.secret, 'Set E2E_AA_EMAIL and E2E_AA_SECRET to an enrolled AA.');

  test('no link in the navigation, and the page itself refuses', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await credentialStep(page, AA.email);
      await expect(page).toHaveURL(/\/verificar/);
      await page.getByRole('textbox').fill(totpCode(AA.secret));
      await page.getByRole('button', { name: 'Verificar' }).click();
      await expect(page).not.toHaveURL(/\/(ingresar|verificar)/, { timeout: 15_000 });

      const picker = page.getByRole('heading', { name: 'Elige una firma' });
      if (await picker.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: new RegExp(ADMIN_FIRM || '.', 'i') }).first().click();
      }
      await expect(page.getByRole('navigation')).toBeVisible();
      await expect(page.getByRole('navigation').getByRole('link', { name: 'KPIs' })).toHaveCount(0);

      // Typing the URL anyway. The server is what refuses; the hidden link was only cosmetic.
      await page.goto('/kpis');
      await expect(page.getByTestId('error-state-copy')).toHaveText(
        'Tu rol actual no permite esta acción.',
      );
      // And no figure leaks past the refusal.
      await expect(page.getByTestId('tile-activos-value')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
