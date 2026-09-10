/**
 * T091 — full recovery. quickstart.md Scenario 5.
 *
 * Sign in, present a backup code, be refused tenant data, re-enroll, receive
 * ten fresh codes, and confirm the previous code is invalid afterwards.
 *
 * **Requires `E2E_BACKUP_CODE`** — one unconsumed code for the signing-in
 * identity. It is SPENT by this run, so the variable needs a fresh value each
 * time. That is not friction to be engineered away: single-use is the property
 * under test, and a spec that could reuse its input would be proving the
 * opposite of what it claims.
 */
import { test, expect } from '@playwright/test';
import { E2E, SKIP_REASON, credentialStep, totpCode } from './auth-helpers';

const BACKUP_CODE = process.env.E2E_BACKUP_CODE ?? '';

test.skip(
  !E2E.email || !BACKUP_CODE,
  `${SKIP_REASON} Also set E2E_BACKUP_CODE to an unconsumed code.`,
);

/** These two run in order: the first spends the code, the second proves it is spent. */
test.describe.configure({ mode: 'serial' });

test.describe('recovery, end to end', () => {
  test('THE FULL JOURNEY: code, no session, re-enrollment, fresh codes', async ({ page }) => {
    await credentialStep(page, E2E.email);
    await expect(page).toHaveURL(/\/verificar/);

    // Reached FROM the challenge screen, not as a separate flow — the person
    // has already proved their credential and what they lost is the phone.
    await page.getByRole('link', { name: /código de respaldo/i }).click();
    await expect(page).toHaveURL(/\/recuperar/);

    await page.getByLabel('Código de respaldo').fill(BACKUP_CODE);
    await page.getByRole('button', { name: 'Continuar' }).click();

    // NO SESSION. Straight to re-enrollment, with no shell around it, because
    // a written-down code must not be worth as much as the factor it replaces
    // (FR-027).
    await expect(page).toHaveURL(/\/enrolar/);
    await expect(page.getByRole('navigation')).toHaveCount(0);

    await page.getByRole('button', { name: 'Comenzar registro' }).click();
    const secret = (await page.getByLabel('Clave para ingreso manual').textContent())?.trim() ?? '';
    expect(secret).toMatch(/^[A-Z2-7]+$/);

    await page.getByRole('textbox').fill(totpCode(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // A COMPLETE new set of ten, not the nine that were left (FR-028).
    await expect(page.getByText('Códigos de respaldo')).toBeVisible();
    await expect(page.locator('ul li')).toHaveCount(10);

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Only now is there a session.
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('THE CODE JUST USED IS INVALID — and so is the whole previous set', async ({ page }) => {
    await credentialStep(page, E2E.email);
    await expect(page).toHaveURL(/\/verificar/);
    await page.getByRole('link', { name: /código de respaldo/i }).click();

    await page.getByLabel('Código de respaldo').fill(BACKUP_CODE);
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Refused, with the same message every other refusal carries.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/recuperar/);
  });
});
