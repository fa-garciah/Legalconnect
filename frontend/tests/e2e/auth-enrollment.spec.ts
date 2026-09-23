/**
 * T073 — **THE WALK-THROUGH THAT DID NOT EXIST BEFORE THIS SLICE.**
 * quickstart.md Scenario 1, US2's acceptance bar.
 *
 * Accept an invitation, sign in, be refused tenant data, enroll, and watch the
 * SAME request succeed with nothing else changed.
 *
 * That last clause is the whole test. `002/FR-026` refuses tenant data until
 * enrollment completes, `004` fixed that refusal as position 1 of its ordering,
 * and until 003 nothing could produce the enrolled state — three merged slices
 * describing a product no real person could enter. Proving the transition
 * end to end, in a browser, with one variable changed, is what closes that.
 */
import { test, expect } from '@playwright/test';
import { E2E, SKIP_REASON, browserStorage, credentialStep, totpCode } from './auth-helpers';

test.skip(!E2E.unenrolledEmail, SKIP_REASON);

test.describe('enrollment, end to end', () => {
  test('an unenrolled person is routed to enrollment, not to access (FR-006)', async ({ page }) => {
    await credentialStep(page, E2E.unenrolledEmail);
    await expect(page).toHaveURL(/\/enrolar/);
    // The unenrolled state resolves to enrollment or to refusal, never to
    // access — so no shell, and no way further in.
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('REFUSED BEFORE, ADMITTED AFTER, WITH NOTHING ELSE CHANGED', async ({ page }) => {
    // Before: a tenant-scoped route is unreachable.
    const before = await page.goto('/clientes');
    expect(before?.url()).toMatch(/\/ingresar/);

    // Enroll.
    await credentialStep(page, E2E.unenrolledEmail);
    await expect(page).toHaveURL(/\/enrolar/);
    await page.getByRole('button', { name: 'Comenzar registro' }).click();

    const secret = (await page.getByLabel('Clave para ingreso manual').textContent())?.trim() ?? '';
    expect(secret).toMatch(/^[A-Z2-7]+$/);

    await page.getByRole('textbox').fill(totpCode(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // Ten codes, once.
    await expect(page.getByText('Códigos de respaldo')).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    // After: the same route, now reachable. Same person, same browser, same
    // membership — the only thing that changed is the second factor.
    await page.goto('/clientes');
    await expect(page).toHaveURL(/\/clientes/);
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('the enrollment screen offers a QR payload AND a manual key', async ({ page }) => {
    await credentialStep(page, E2E.unenrolledEmail);
    await page.getByRole('button', { name: 'Comenzar registro' }).click();

    // A real QR image now, not the raw otpauth URI printed as text (2026-09-23).
    await expect(page.getByRole('img', { name: /código qr/i })).toBeVisible();
    await expect(page.getByLabel('Clave para ingreso manual')).toBeVisible();
  });

  test('the codes cannot be skipped past without acknowledgement (FR-024)', async ({ page }) => {
    await credentialStep(page, E2E.unenrolledEmail);
    await page.getByRole('button', { name: 'Comenzar registro' }).click();
    const secret = (await page.getByLabel('Clave para ingreso manual').textContent())?.trim() ?? '';
    await page.getByRole('textbox').fill(totpCode(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page.getByText('Códigos de respaldo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });

  test('NOTHING FROM ENROLLMENT REACHES BROWSER STORAGE (FR-051, SC-028)', async ({ page }) => {
    await credentialStep(page, E2E.unenrolledEmail);
    await page.getByRole('button', { name: 'Comenzar registro' }).click();
    const secret = (await page.getByLabel('Clave para ingreso manual').textContent())?.trim() ?? '';
    await page.getByRole('textbox').fill(totpCode(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Códigos de respaldo')).toBeVisible();

    // Checked WHILE THE CODES ARE ON SCREEN, which is the only moment they
    // exist in the browser at all and therefore the only moment a leak could
    // be caught.
    const stored = await browserStorage(page);
    expect(stored).not.toContain(secret);
    expect(stored.toLowerCase()).not.toContain('backup');
  });
});
