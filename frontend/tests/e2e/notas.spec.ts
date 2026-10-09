/**
 * 008 T024 — notes and activity against a running backend and 022's demo firm.
 *
 * The demo partner writes, corrects and voids a note on a matter, then reads the matter's activity:
 * the three changes are there, as sentences, and the note's text is not (008/FR-014). The billing
 * manager's side is in `notas-billing.spec.ts`: a worker-scoped option such as `demoAs` cannot be set
 * per describe, so a second person means a second file.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo`, `E2E_SIGNIN_*`. One sign-in.
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
