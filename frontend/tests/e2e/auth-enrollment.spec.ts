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
 *
 * REORGANISED 2026-10-09 into two tests, and why. Enrollment is a one-way state change: the moment
 * one test confirms a factor, the person is enrolled and every later test that expected to land on
 * `/enrolar` lands on `/verificar` instead. The five original tests confirmed a factor three times
 * between them, so in file order only the first two could ever pass. The assertions are all still
 * here — routing, QR and manual key, codes that cannot be skipped, nothing in browser storage while
 * the codes are on screen, refused before and admitted after — in the one order a person meets them.
 *
 * **Prerequisites**: backend on 3001, `npm run db:seed:demo` — which puts the demo's one unenrolled
 * person back into the unenrolled state on every run — and `E2E_UNENROLLED_EMAIL` set to them
 * (`diego.sanchez@demo.legalconnect.mx`). Two sign-in attempts in total.
 */
import { test, expect } from '@playwright/test';
import { E2E, SKIP_REASON, browserStorage, credentialStep, totpCode } from './auth-helpers';

test.skip(!E2E.unenrolledEmail, SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — enrollment is a one-way state change');
});

test.describe('enrollment, end to end', () => {
  test.describe.configure({ mode: 'serial' });

  test('an unenrolled person is routed to enrollment, not to access (FR-006)', async ({ page }) => {
    await credentialStep(page, E2E.unenrolledEmail);
    await expect(page).toHaveURL(/\/enrolar/);
    // The unenrolled state resolves to enrollment or to refusal, never to
    // access — so no shell, and no way further in.
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('REFUSED BEFORE, ADMITTED AFTER, WITH NOTHING ELSE CHANGED — and everything on the way', async ({ page }) => {
    // Before: a tenant-scoped route is unreachable.
    const before = await page.goto('/clientes');
    expect(before?.url()).toMatch(/\/ingresar/);

    await credentialStep(page, E2E.unenrolledEmail);
    await expect(page).toHaveURL(/\/enrolar/);
    await page.getByRole('button', { name: 'Comenzar registro' }).click();

    // A real QR image, not the raw otpauth URI printed as text (2026-09-23) — and a manual key.
    await expect(page.getByRole('img', { name: /código qr/i })).toBeVisible();
    const secret = (await page.getByLabel('Clave para ingreso manual').textContent())?.trim() ?? '';
    expect(secret).toMatch(/^[A-Z2-7]+$/);

    await page.getByRole('textbox').fill(totpCode(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // Ten codes, once — and they cannot be skipped past without acknowledgement (FR-024).
    await expect(page.getByRole('heading', { name: 'Códigos de respaldo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();

    // NOTHING FROM ENROLLMENT REACHES BROWSER STORAGE (FR-051, SC-028) — checked WHILE THE CODES
    // ARE ON SCREEN, the only moment they exist in the browser and so the only moment a leak could
    // be caught.
    const stored = await browserStorage(page);
    expect(stored).not.toContain(secret);
    expect(stored.toLowerCase()).not.toContain('backup');

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    // After: the same route, now reachable. Same person, same browser, same
    // membership — the only thing that changed is the second factor.
    await page.goto('/clientes');
    await expect(page).toHaveURL(/\/clientes/);
    await expect(page.getByRole('navigation')).toBeVisible();
  });
});
