/**
 * 024 T011 — the Dashboard Principal against a running backend and 022's demo firm.
 *
 * The demo partner lands on `/` and sees the tiles and sections; after writing a note on a matter,
 * "Actividad reciente" shows the change, by position, with the matter — and not the note's text.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo`, `E2E_SIGNIN_*`. One sign-in.
 */
import { test, expect, demoConfigured, DEMO_SKIP_REASON } from './demo-session';

test.skip(!demoConfigured(), DEMO_SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

test.describe('the dashboard', () => {
  test('lands on the dashboard with its tiles and sections, and a link to the firm KPIs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard Principal', level: 1 })).toBeVisible();
    await expect(page.getByText('Expedientes activos')).toBeVisible();
    await expect(page.getByText('Mis horas de hoy')).toBeVisible();
    for (const name of ['Hoy', 'Plazos próximos', 'Plazos de los últimos 7 días', 'Actividad reciente']) {
      await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Ver indicadores del despacho' })).toHaveAttribute('href', '/kpis');
    await expect(page.getByText(/vencid/i)).toHaveCount(0);
  });

  test('a note written on a matter appears in recent activity, without its text', async ({ page }) => {
    const text = `Nota tablero ${Date.now()}`;
    await page.goto('/expedientes');
    await page.getByRole('button', { name: /^abrir /i }).first().click();
    await page.getByRole('dialog').getByRole('link', { name: 'Notas del expediente' }).click();
    await page.getByLabel('Nueva nota').fill(text);
    await page.getByRole('button', { name: 'Guardar nota' }).click();
    await expect(page.getByRole('article').filter({ hasText: text })).toBeVisible();

    await page.goto('/');
    const activity = page.getByRole('region', { name: 'Actividad reciente' });
    await expect(activity.getByText(/agregó una nota$/).first()).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);
  });
});
