/**
 * 013 T017 — the calendar against a running backend.
 *
 * Create a hearing linked to a case → it shows on its day with the case → edit its time → cancel
 * it (kept, shown when "Mostrar cancelados") → an all-day deadline starting within its reminder
 * window shows under "Recordatorios".
 *
 * **Prerequisites**: as `configuracion.spec.ts`. **Writes** events into the first case of the firm
 * and leaves them (cancelled or past) behind; 013 has no delete by design.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E, SKIP_REASON, credentialStep, totpCode } from './auth-helpers';

const ADMIN_FIRM = process.env.E2E_ADMIN_FIRM ?? '';
const STAMP = Date.now();
const HEARING = `Audiencia e2e ${STAMP}`;
const DEADLINE = `Vencimiento e2e ${STAMP}`;

/** Today in Mexico City, `YYYY-MM-DD`. */
function mexicoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

function plusDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — the flow writes');
});

test.describe('the firm calendar', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;

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

  test('the navigation leads to the calendar', async () => {
    await page.getByRole('link', { name: 'Calendario' }).click();
    await expect(page).toHaveURL(/\/calendario$/);
    await expect(page.getByRole('heading', { name: 'Calendario', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /mes siguiente/i })).toBeVisible();
  });

  test('create a hearing linked to a case; it shows on today with the case', async () => {
    await page.getByRole('button', { name: 'Nuevo evento' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título').fill(HEARING);
    await dialog.getByLabel('Hora de inicio').fill('23:00');
    const caseSelect = dialog.getByLabel('Expediente');
    await expect(caseSelect.locator('option').nth(1)).toBeAttached({ timeout: 10_000 });
    await caseSelect.selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Guardar evento' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    const item = page.getByRole('listitem').filter({ hasText: HEARING });
    await expect(item).toBeVisible();
    await expect(item).toContainText('23:00');
    await expect(item.getByRole('link', { name: /^EXP-/ })).toBeVisible();
  });

  test('edit its time', async () => {
    await page.getByRole('button', { name: `Editar ${HEARING}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Hora de inicio').fill('22:30');
    await dialog.getByRole('button', { name: 'Guardar evento' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole('listitem').filter({ hasText: HEARING })).toContainText('22:30');
  });

  test('cancel it: gone by default, kept and marked when showing cancelled', async () => {
    await page.getByRole('button', { name: `Cancelar ${HEARING}` }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('no se borra');
    await confirm.getByRole('button', { name: 'Cancelar evento' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: HEARING })).toHaveCount(0, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Mostrar cancelados' }).click();
    const item = page.getByRole('listitem').filter({ hasText: HEARING });
    await expect(item).toBeVisible({ timeout: 10_000 });
    await expect(item).toContainText('Cancelado');
    await page.getByRole('button', { name: 'Ocultar cancelados' }).click();
  });

  test('an all-day deadline tomorrow with a 2-day reminder shows under "Recordatorios"', async () => {
    await page.getByRole('button', { name: 'Nuevo evento' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Tipo').selectOption('deadline');
    await dialog.getByLabel('Título').fill(DEADLINE);
    await dialog.getByLabel('Todo el día').check();
    await dialog.getByLabel('Fecha').fill(plusDays(mexicoToday(), 1));
    await dialog.getByLabel('Recordatorio').selectOption('2880');
    await dialog.getByRole('button', { name: 'Guardar evento' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    const reminders = page.getByRole('region', { name: 'Recordatorios' });
    await expect(reminders.getByText(DEADLINE)).toBeVisible({ timeout: 10_000 });
  });
});
