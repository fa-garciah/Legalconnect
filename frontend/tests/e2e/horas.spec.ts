/**
 * 009 T031 — `/horas` against a running backend and the demo firm.
 *
 * WHAT ONLY AN E2E CAN SHOW HERE: that the timer is SERVER state (it survives a reload), that a
 * stopped timer and a manual entry land on the same timesheet as the same kind of thing, and that
 * a correction and a void round-trip through the real 24-hour window.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo`, and `E2E_SIGNIN_EMAIL` /
 * `E2E_SIGNIN_SECRET` / `E2E_SIGNIN_PASSWORD` for an enrolled `MP`, `AA`, `PL` or `CM` with one
 * firm — the demo's junior associate, Jorge González, is the intended one. Optionally
 * `E2E_BM_EMAIL` / `E2E_BM_SECRET` for the billing manager, to assert the entry is absent for them.
 *
 * Every description it writes carries a timestamp, so reruns never confuse an old row for a new one;
 * the manual entry it creates is voided at the end, so reruns do not grow the person's week.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E, SKIP_REASON, credentialStep, totpCode } from './auth-helpers';

const BM = { email: process.env.E2E_BM_EMAIL ?? '', secret: process.env.E2E_BM_SECRET ?? '' };

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — the responsive check is quickstart Q15');
});

async function signIn(page: Page, email: string, secret: string): Promise<void> {
  await credentialStep(page, email);
  await expect(page).toHaveURL(/\/verificar/);
  await page.getByRole('textbox').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).not.toHaveURL(/\/(ingresar|verificar)/, { timeout: 15_000 });
  await expect(page.getByRole('navigation')).toBeVisible();
}

test.describe('recording time', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;
  const stamp = Date.now();
  const timerText = `Revisión de expediente e2e ${stamp}`;
  const manualText = `Llamada con el cliente e2e ${stamp}`;

  /** ONE sign-in for the file — the sign-in throttle is per origin (see `kpis.spec.ts`). */
  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== 'desktop') return;
    context = await browser.newContext();
    page = await context.newPage();
    await signIn(page, E2E.email, E2E.secret);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  const entry = (text: string) => page.getByRole('listitem').filter({ hasText: text });

  test('the navigation leads to Registro de Horas', async () => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Registro de Horas' }).click();
    await expect(page).toHaveURL(/\/horas$/);
    await expect(page.getByRole('heading', { name: 'Registro de Horas', level: 1 })).toBeVisible();
    // The demo seed gives every timekeeper history; a fresh firm would show the empty state.
    await expect(page.getByText(/Total del periodo:/)).toBeVisible({ timeout: 15_000 });
  });

  test('a timer started on a matter survives a reload, then stops into an entry', async () => {
    // A rerun may find a timer left by an interrupted earlier run: clear it first.
    const leftover = page.getByRole('button', { name: 'Descartar' });
    if (await leftover.isVisible().catch(() => false)) await leftover.click();

    const select = page.getByLabel('Expediente del cronómetro');
    await expect(select.locator('option').nth(1)).toBeAttached({ timeout: 15_000 });
    await select.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Iniciar cronómetro' }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Descripción del trabajo').fill(timerText);
    await page.getByRole('button', { name: 'Detener y registrar' }).click();
    await expect(entry(timerText)).toBeVisible({ timeout: 15_000 });
    await expect(entry(timerText)).toContainText('Cronómetro');
    await expect(page.getByRole('button', { name: 'Iniciar cronómetro' })).toBeVisible();
  });

  test('a manual entry of 1 h 30 min lands on the same timesheet', async () => {
    await page.getByRole('button', { name: 'Registrar horas' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Expediente').locator('option').nth(1)).toBeAttached({ timeout: 15_000 });
    await dialog.getByLabel('Expediente').selectOption({ index: 1 });
    await dialog.getByLabel('Horas').fill('1');
    await dialog.getByLabel('Minutos').fill('30');
    await dialog.getByLabel('Descripción').fill(manualText);
    await dialog.getByRole('button', { name: 'Registrar' }).click();
    await expect(entry(manualText)).toContainText('1 h 30 min', { timeout: 15_000 });
    await expect(entry(manualText)).toContainText('Manual');
  });

  test('it is corrected to 45 min within its window', async () => {
    await entry(manualText).getByRole('button', { name: /corregir/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Horas').fill('0');
    await dialog.getByLabel('Minutos').fill('45');
    await dialog.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(entry(manualText)).toContainText('45 min', { timeout: 15_000 });
    await expect(entry(manualText)).not.toContainText('1 h 30 min');
  });

  test('voiding it removes it from the timesheet', async () => {
    await entry(manualText).getByRole('button', { name: /eliminar/i }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar registro' }).click();
    await expect(entry(manualText)).toHaveCount(0, { timeout: 15_000 });
    await expect(entry(timerText)).toBeVisible();
  });
});

test.describe('a billing manager', () => {
  test.skip(!BM.email || !BM.secret, 'Set E2E_BM_EMAIL and E2E_BM_SECRET to check the BM side.');

  test('has no Registro de Horas, and the page tells them so', async ({ page }) => {
    await signIn(page, BM.email, BM.secret);
    await expect(page.getByRole('navigation').getByText('Registro de Horas')).toHaveCount(0);
    await page.goto('/horas');
    await expect(page.getByText('Tu rol no registra horas en el despacho.')).toBeVisible();
  });
});
