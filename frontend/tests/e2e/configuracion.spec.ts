/**
 * 014 T029 — `/configuracion` against a running backend.
 *
 * The journey this slice exists for: an administrator invites a person, copies the one-time
 * link, the person accepts it at `/aceptar/{raw}`, and appears in the firm's member list. Plus
 * the two other irreversible actions on the page: revoking an invitation, retiring a position.
 *
 * **Prerequisites** (as `auth-helpers.ts`): backend on 3001, migrated and seeded;
 * `E2E_SIGNIN_EMAIL` / `E2E_SIGNIN_SECRET` (and `E2E_SIGNIN_PASSWORD`) for an enrolled identity
 * that is SA or MP in `E2E_ADMIN_FIRM` (a firm name; the first firm offered if unset). Nothing is
 * checked in — a TOTP secret is exactly what 003 removed from the repository.
 *
 * **This test writes** and leaves its rows behind: an accepted member, a revoked invitation and
 * a retired position. None of 002/017 offers a delete, deliberately.
 *
 * **Serial, one sign-in.** 003's replay guard refuses a TOTP code presented twice within 90
 * seconds, so four tests each signing in would refuse all but the first. They share one signed-in
 * page instead. (Step-up codes are not replay-guarded — reported separately against 005.)
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { E2E, SKIP_REASON, credentialStep, totpCode } from './auth-helpers';

const ADMIN_FIRM = process.env.E2E_ADMIN_FIRM ?? '';

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);
// One run is enough: the flow writes, and the mobile project would only repeat it.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
});

function unique(stem: string): string {
  return `${stem}-${Date.now()}-${test.info().workerIndex}`;
}

async function signInAsAdmin(page: Page): Promise<void> {
  await credentialStep(page, E2E.email);
  await expect(page).toHaveURL(/\/verificar/);
  await page.getByRole('textbox').fill(totpCode(E2E.secret));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).not.toHaveURL(/\/(ingresar|verificar)/, { timeout: 15_000 });

  // Several firms → the picker asks. One firm → straight in.
  const picker = page.getByRole('heading', { name: 'Elige una firma' });
  if (await picker.isVisible().catch(() => false)) {
    const choice = ADMIN_FIRM
      ? page.getByRole('button', { name: new RegExp(ADMIN_FIRM, 'i') })
      : page.getByRole('main').getByRole('button').first();
    await choice.click();
  }
  await expect(page.getByRole('navigation')).toBeVisible();
}

/** Completes the second-factor prompt the gated actions open. */
async function stepUp(page: Page): Promise<void> {
  const field = page.getByLabel('Código de seis dígitos');
  await expect(field).toBeVisible();
  await field.fill(totpCode(E2E.secret));
  await page.getByRole('button', { name: 'Verificar' }).click();
}

async function invite(page: Page, email: string): Promise<string> {
  await page.getByRole('button', { name: 'Invitar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Rol en el despacho').selectOption('AA');
  await dialog.getByRole('button', { name: 'Enviar invitación' }).click();
  await stepUp(page);

  const link = page.getByLabel('Enlace de invitación');
  await expect(link).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/solo se muestra una vez/i)).toBeVisible();
  const value = await link.inputValue();
  expect(value).toMatch(/\/aceptar\/[A-Za-z0-9_-]{32,}$/);
  await page.getByRole('button', { name: 'Listo' }).click();
  return value;
}

async function acceptInFreshBrowser(browser: Browser, link: string, email: string): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(link);
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('una-contrasena-e2e-de-014');
    await page.getByLabel('Confirma tu contraseña').fill('una-contrasena-e2e-de-014');
    await page.getByRole('button', { name: 'Crear mi acceso' }).click();
    await expect(page).toHaveURL(/\/ingresar\?invitacion=aceptada/, { timeout: 15_000 });
  } finally {
    await context.close();
  }
}

test.describe('/configuracion', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== 'desktop') return;
    context = await browser.newContext();
    page = await context.newPage();
    await signInAsAdmin(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('invite → copy link → accept → the new member is listed', async ({ browser }) => {
    await page.getByRole('link', { name: 'Configuración' }).click();
    await expect(page.getByRole('heading', { name: 'Configuración del despacho' })).toBeVisible();

    const email = `${unique('e2e-014')}@example.com`;
    const link = await invite(page, email);

    // Pending, by email (FR-028) — and the link is not on the page any more.
    await expect(page.getByRole('cell', { name: email, exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(link.split('/').pop()!);

    await acceptInFreshBrowser(browser, link, email);

    await page.reload();
    const members = page.getByRole('region', { name: 'Miembros del despacho' });
    await expect(members.getByRole('cell', { name: email, exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('revoke a pending invitation', async () => {
    await page.goto('/configuracion');

    const email = `${unique('e2e-014-revoke')}@example.com`;
    await invite(page, email);

    const pending = page.getByRole('region', { name: 'Invitaciones pendientes' });
    await pending.getByRole('button', { name: `Revocar la invitación de ${email}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revocar invitación' }).click();
    await stepUp(page);

    await expect(pending.getByRole('cell', { name: email, exact: true })).toHaveCount(0, { timeout: 10_000 });
  });

  test('create and retire a position', async () => {
    await page.goto('/configuracion');
    await page.getByRole('tab', { name: 'Cargos y roles' }).click();

    const name = unique('Cargo e2e');
    await page.getByRole('button', { name: 'Nuevo cargo' }).click();
    await page.getByRole('dialog').getByLabel('Nombre del cargo').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Crear cargo' }).click();

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row.getByText('Activo')).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: `Retirar el cargo ${name}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Retirar cargo' }).click();
    await expect(row.getByText('Retirado')).toBeVisible({ timeout: 10_000 });
  });

  test('the permissions matrix offers nothing to change', async () => {
    await page.goto('/configuracion');
    await page.getByRole('tab', { name: 'Matriz de permisos' }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('note')).toContainText('Los roles los define LegalConnect');
    await expect(panel.getByRole('button')).toHaveCount(0);
    await expect(panel.locator('input, select, textarea')).toHaveCount(0);
  });
});
