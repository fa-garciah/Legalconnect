/**
 * T061 — a full sign-in, at desktop AND mobile viewports. SC-005, SC-027.
 *
 * **Prerequisites** (quickstart.md): PostgreSQL up, migrated and seeded; the API
 * on 3001; Next on 3000 (Playwright's `webServer` starts it); and
 * `E2E_SIGNIN_EMAIL` / `E2E_SIGNIN_SECRET` naming an ENROLLED identity whose
 * TOTP secret the spec can derive codes from.
 *
 * **Why those two variables rather than a fixture file.** A real sign-in needs a
 * real second factor, so the spec must be able to produce a valid code — which
 * means holding the secret. That is the one place in this product where a TOTP
 * secret exists outside the database, and it exists only because a test needs
 * to act as the person. It is deliberately NOT checked in: `003` deleted
 * `principal.fixture.json` precisely to stop authentication material living in
 * the repository.
 *
 * Produce them by enrolling once through the UI and copying the manual-entry key
 * off the enrollment screen, or from a seeding script.
 *
 * **The second sign-in is the point of this spec.** SC-027 requires that a
 * person signing in again from the SAME browser is challenged in full. There is
 * no trusted-device mechanism and none may be built, so a second visit must be
 * exactly as demanding as the first — and a session cookie left behind by the
 * first is precisely what would make it not so.
 */
import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

const EMAIL = process.env.E2E_SIGNIN_EMAIL ?? '';
const SECRET = process.env.E2E_SIGNIN_SECRET ?? '';
const PASSWORD = process.env.E2E_SIGNIN_PASSWORD ?? 'una-contrasena-larga-de-prueba';

/**
 * RFC 6238, twenty lines of it, rather than a dependency.
 *
 * `otplib` is the backend's and is pinned there as a load-bearing dependency
 * under Principle II's blast radius. Adding it to `frontend/` so one Playwright
 * spec can derive a code would put a TOTP implementation in this project's
 * dependency tree for a reason that has nothing to do with what the browser
 * does — the browser never sees a secret. Playwright runs in Node, so
 * `node:crypto` is enough.
 */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of input.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, epochSeconds = Math.floor(Date.now() / 1000)): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(epochSeconds / 30)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

test.skip(
  !EMAIL || !SECRET,
  'Set E2E_SIGNIN_EMAIL and E2E_SIGNIN_SECRET to an enrolled identity — see the header of this file.',
);

async function signIn(page: Page): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page).toHaveURL(/\/verificar/);
  const code = totpCode(SECRET);
  await page.getByRole('textbox').fill(code);
  await page.getByRole('button', { name: 'Verificar' }).click();
}

test.describe('sign-in, end to end', () => {
  for (const viewport of ['desktop', 'mobile'] as const) {
    test(`completes at the ${viewport} viewport (SC-005)`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== viewport, 'runs under its own project');

      await signIn(page);
      // Landed inside the product, with the shell around it — which is also the
      // proof that `getPrincipal()` resolved a real session, since the shell
      // renders from it.
      await expect(page).toHaveURL(/\/(?!ingresar|verificar)/);
      await expect(page.getByRole('navigation')).toBeVisible();
    });
  }

  test('THE SECOND SIGN-IN FROM THE SAME BROWSER IS CHALLENGED IN FULL (SC-027)', async ({
    page,
    context,
  }) => {
    await signIn(page);

    // Sign out by dropping the session cookie, which is what a real sign-out
    // does server-side. The point is that the BROWSER is the same one.
    await context.clearCookies({ name: 'authjs.session-token' });
    await context.clearCookies({ name: '__Secure-authjs.session-token' });

    await page.goto('/ingresar');
    await page.getByLabel('Correo electrónico').fill(EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Challenged again. Not "sometimes", not "unless remembered".
    await expect(page).toHaveURL(/\/verificar/);
    await expect(page.getByText('Código de verificación')).toBeVisible();
  });

  test('the challenge screen offers NO trusted-device control (FR-019)', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo electrónico').fill(EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/verificar/);

    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  });

  test('a wrong credential shows the one uniform refusal and stays put', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo electrónico').fill(EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill('una-contrasena-que-no-es');
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('AFTER A COMPLETE SIGN-IN, BROWSER STORAGE HOLDS NOTHING (FR-051, SC-028)', async ({
    page,
  }) => {
    // T095's subject, asserted here too for the sign-in flow specifically, so
    // this spec fails on its own if the credential ever starts being cached.
    await signIn(page);

    const stored = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
    }));

    for (const blob of [stored.local, stored.session]) {
      expect(blob).not.toContain(PASSWORD);
      expect(blob).not.toContain(SECRET);
      expect(blob.toLowerCase()).not.toContain('accesstoken');
      expect(blob.toLowerCase()).not.toContain('refreshtoken');
    }
  });
});
