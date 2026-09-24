/**
 * 021 T029 — a matter's documents, against a running backend and the real object store.
 *
 * Upload a PDF → it previews inline (MinIO serves it framable and `inline`) → download keeps its
 * original, accented name (Decision 4) → change its category → withdraw → find it under
 * "Retirados" → restore. And no signed URL is left in browser storage (FR-011).
 *
 * **Prerequisites**: as `configuracion.spec.ts` — backend on 3001 with migration 0045, MinIO on
 * 9000, `E2E_SIGNIN_*` for an enrolled MP or SA of `E2E_ADMIN_FIRM`, which has at least one case.
 * **Writes** a document into that case and leaves it (restored) behind; 007 has no delete.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E, SKIP_REASON, browserStorage, credentialStep, totpCode } from './auth-helpers';

const ADMIN_FIRM = process.env.E2E_ADMIN_FIRM ?? '';
const FILENAME = `Contrato Señor Pérez ${Date.now()}.pdf`;
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — the flow writes');
});

test.describe('documents of a matter', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;
  let documentsUrl: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== 'desktop') return;
    context = await browser.newContext({ acceptDownloads: true });
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

  test('the case panel leads to the documents page', async () => {
    await page.goto('/expedientes');
    await page.getByRole('button', { name: /^Abrir / }).first().click();
    const link = page.getByRole('link', { name: 'Documentos del expediente' });
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
    await expect(page).toHaveURL(/\/expedientes\/[0-9a-f-]{36}\/documentos$/);
    await expect(page.getByRole('heading', { name: /Documentos ·/ })).toBeVisible();
    documentsUrl = page.url();
  });

  test('upload a PDF; it is listed under its own name', async () => {
    await page.getByRole('button', { name: 'Subir documento' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Archivo').setInputFiles({ name: FILENAME, mimeType: 'application/pdf', buffer: PDF });
    await dialog.getByRole('button', { name: 'Subir documento' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('cell', { name: FILENAME, exact: true })).toBeVisible();
  });

  test('"Ver" renders it inline from the object store', async () => {
    await page.getByRole('button', { name: `Ver ${FILENAME}` }).click();
    const frame = page.getByTitle(`Vista previa de ${FILENAME}`);
    await expect(frame).toBeVisible({ timeout: 10_000 });
    const src = (await frame.getAttribute('src'))!;
    const served = await page.request.get(src);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toBe('application/pdf');
    expect(served.headers()['content-disposition']).toMatch(/^inline;/);
    expect(served.headers()['x-frame-options']).toBeUndefined();
  });

  test('"Descargar" saves it under its original name', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: `Descargar ${FILENAME}` }).first().click(),
    ]);
    expect(download.suggestedFilename()).toBe(FILENAME);
  });

  test('change its category', async () => {
    await page.getByRole('button', { name: `Cambiar categoría de ${FILENAME}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nueva categoría').selectOption({ label: 'Contrato' });
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('row', { name: new RegExp(FILENAME) }).getByText('Contrato')).toBeVisible();
  });

  test('withdraw it, find it under "Retirados", restore it', async () => {
    await page.getByRole('button', { name: `Retirar ${FILENAME}` }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('no se borra');
    await confirm.getByRole('button', { name: 'Retirar documento' }).click();
    await expect(page.getByRole('cell', { name: FILENAME, exact: true })).toHaveCount(0, { timeout: 10_000 });

    await page.getByRole('tab', { name: 'Retirados' }).click();
    await page.getByRole('button', { name: `Restaurar ${FILENAME}` }).click();
    await page.getByRole('tab', { name: 'Documentos' }).click();
    await expect(page.getByRole('cell', { name: FILENAME, exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('no signed URL is left in browser storage', async () => {
    await page.goto(documentsUrl);
    const storage = await browserStorage(page);
    expect(storage).not.toContain('X-Amz-Signature');
    expect(storage).not.toContain(':9000');
  });
});
