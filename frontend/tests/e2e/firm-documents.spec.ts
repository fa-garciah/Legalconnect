/**
 * 023 T029 — `/documentos` against a running backend and real data.
 *
 * WHAT ONLY AN E2E CAN SHOW HERE: that the count on screen is the *server's* count under this
 * person's own scope, and that it moves when a filter narrows the set. The component tests
 * assert that against a mocked response; this asserts it against a database.
 *
 * **Prerequisites**: backend on 3001, and `E2E_SIGNIN_EMAIL` / `E2E_SIGNIN_SECRET` /
 * `E2E_SIGNIN_PASSWORD` for an enrolled `MP` or `SA` of a firm that has documents.
 * `022-demo-firm-seed` makes that trivial for the first time — `npm run db:seed:demo` prints
 * exactly those three values, for a firm with 128 active documents across 40 matters.
 *
 * **Read-only.** It uploads nothing and withdraws nothing, so it can run repeatedly against
 * the demo firm without changing it. `021`'s spec owns the write-path walk-through.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E, SKIP_REASON, credentialStep, totpCode } from './auth-helpers';

const ADMIN_FIRM = process.env.E2E_ADMIN_FIRM ?? '';

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — this is a layout-independent read');
});

test.describe('the firm\'s documents', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;

  /**
   * ONE sign-in for the whole file, and that is not an optimisation.
   *
   * The first version signed in per test, and the run failed from the second test onward
   * with the browser stuck on `/verificar`. The cause is the product working correctly:
   * `sign-in.service.ts:95` throttles by ORIGIN — five attempts per fifteen minutes,
   * in-memory — and five tests each signing in from the same loopback origin trips it. The
   * refusal is deliberately the same uniform one a wrong password gets, so the symptom says
   * nothing about the cause.
   *
   * Worth knowing beyond this file: a burst of local API experiments shares that bucket, so
   * an e2e run right after one can fail for a reason that is neither the test's nor the
   * code's. Restarting the backend clears it.
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
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('the navigation offers Documentos, and it leads somewhere', async () => {
    await page.goto('/');
    // 023/FR-014: until this slice the entry was `available: false` and rendered as inert
    // text. This is the assertion that it is now a link.
    const link = page.getByRole('link', { name: 'Documentos' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/documentos$/);
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
  });

  test('it lists the firm\'s documents with a count and a matter per card', async () => {
    await page.goto('/documentos');
    const count = page.getByTestId('document-count');
    await expect(count).toBeVisible();
    // The server's count, not the page's length: a firm with more than one page of documents
    // still reports the whole filtered set.
    await expect(count).toHaveText(/\d+ documentos?/);

    const cards = page.locator('[data-testid^="document-card-"]');
    await expect(cards.first()).toBeVisible();
    // Every card names its matter — the field that makes a firm-wide list usable at all.
    await expect(cards.first()).toContainText(/EXP-/);
  });

  test('searching narrows both the list and the count', async () => {
    await page.goto('/documentos');
    // Wait for a CARD, not merely for the count element. The count used to render a
    // placeholder "0 documentos" while the query was in flight; this assertion read that
    // zero and then compared it against a filtered count. The flake exposed a real defect,
    // and the component now renders no count until the server has given one.
    await expect(page.locator('[data-testid^="document-card-"]').first()).toBeVisible();
    const count = page.getByTestId('document-count');
    const before = Number((await count.innerText()).replace(/\D/g, ''));
    expect(before).toBeGreaterThan(0);

    await page
      .getByLabel('Buscar documentos por nombre o número de expediente')
      .fill('dictamen');

    // The count is what proves the SERVER filtered, rather than the browser hiding rows.
    await expect(count).not.toHaveText(`${before} documentos`, { timeout: 10_000 });
    const after = Number((await count.innerText()).replace(/\D/g, ''));
    expect(after).toBeLessThan(before);

    const cards = page.locator('[data-testid^="document-card-"]');
    if (after > 0) await expect(cards.first()).toContainText(/dictamen/i);
  });

  test('the grid/list toggle changes the layout and is remembered', async () => {
    await page.goto('/documentos');
    await expect(page.locator('[data-testid^="document-card-"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Ver como lista' }).click();
    await expect(page.locator('[data-testid^="document-row-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="document-card-"]')).toHaveCount(0);

    // FR-011 — per viewer, in the browser. A reload keeps it.
    await page.reload();
    await expect(page.locator('[data-testid^="document-row-"]').first()).toBeVisible();
  });

  test('a filter that matches nothing offers a way out', async () => {
    await page.goto('/documentos');
    await page
      .getByLabel('Buscar documentos por nombre o número de expediente')
      .fill('zzzz-no-existe-zzzz');
    await expect(page.getByTestId('document-count')).toHaveText('0 documentos', { timeout: 10_000 });
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toBeVisible();
  });
});
