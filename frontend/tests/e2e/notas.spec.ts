/**
 * 008 T024 — notes and activity against a running backend and 022's demo firm.
 *
 * The demo partner writes, corrects and voids a note on a matter, then reads the matter's activity:
 * the three changes are there, as sentences, and the note's text is not (008/FR-014). The billing
 * manager, who holds no case capability, gets the no-access copy without a request.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo`, `E2E_SIGNIN_*` and `E2E_BM_*`.
 * Two sign-ins in all (one per describe) — run alone, `--workers=1`, desktop.
 */
import { test, expect, demoConfigured, DEMO_SKIP_REASON } from './demo-session';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

test.describe('a partner keeps notes on a matter', () => {
  test.skip(!demoConfigured(), DEMO_SKIP_REASON);

  test('write, correct and void a note; the activity shows the three changes and no text', async ({ page }) => {
    const text = `Nota e2e ${Date.now()}`;
    await page.goto('/expedientes');
    await page.getByRole('button', { name: /^abrir /i }).first().click();
    const panel = page.getByRole('dialog');
    await panel.getByRole('link', { name: 'Notas del expediente' }).click();
    await expect(page).toHaveURL(/\/expedientes\/[^/]+\/notas$/);

    await page.getByLabel('Nueva nota').fill(text);
    await page.getByRole('button', { name: 'Guardar nota' }).click();
    const note = page.getByRole('article').filter({ hasText: text });
    await expect(note).toBeVisible();
    await expect(page.getByLabel('Nueva nota')).toHaveValue('');

    await note.getByRole('button', { name: 'Corregir' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Texto de la nota').fill(`${text} (corregida)`);
    await dialog.getByRole('button', { name: 'Guardar corrección' }).click();
    const corrected = page.getByRole('article').filter({ hasText: `${text} (corregida)` });
    await expect(corrected).toBeVisible();

    await corrected.getByRole('button', { name: 'Eliminar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar nota' }).click();
    await expect(page.getByRole('article').filter({ hasText: text })).toHaveCount(0);

    await page.getByRole('link', { name: 'Actividad', exact: true }).click();
    await expect(page).toHaveURL(/\/actividad$/);
    const feed = page.getByRole('list');
    await expect(feed.getByText(/agregó una nota$/).first()).toBeVisible();
    await expect(feed.getByText(/corrigió una nota$/).first()).toBeVisible();
    await expect(feed.getByText(/eliminó una nota$/).first()).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);
  });
});

test.describe('the billing manager', () => {
  test.use({ demoAs: 'billing' });
  test.skip(!demoConfigured('billing'), DEMO_SKIP_REASON);

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
