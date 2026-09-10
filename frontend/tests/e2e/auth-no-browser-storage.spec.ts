/**
 * T095 — after each of the four flows, browser storage holds 0 credentials,
 * factor secrets or backup codes. FR-051, SC-028.
 *
 * The component tests already assert this per screen. This asserts it after a
 * REAL journey, and the difference is not pedantry: a component test renders
 * one component with mocked fetches, so it cannot see anything written by
 * NextAuth, by the router, or by a library reacting to a real response. The
 * leak this catches is the one nobody wrote on purpose.
 *
 * It also checks INDEXEDDB, which the component tests do not — jsdom has no
 * meaningful implementation, so that third storage area is only observable in
 * a real browser.
 */
import { test, expect, type Page } from '@playwright/test';
import { E2E, SKIP_REASON, browserStorage, credentialStep, totpCode } from './auth-helpers';

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);

/** Everything that must never appear, whatever the flow. */
function assertNothingSensitive(stored: string): void {
  expect(stored).not.toContain(E2E.password);
  expect(stored).not.toContain(E2E.secret);

  const lowered = stored.toLowerCase();
  for (const forbidden of ['accesstoken', 'refreshtoken', 'challengetoken', 'enrollmenttoken', 'backup']) {
    expect(lowered, `browser storage mentions ${forbidden}`).not.toContain(forbidden);
  }
}

async function completeSignIn(page: Page): Promise<void> {
  await credentialStep(page, E2E.email);
  await expect(page).toHaveURL(/\/verificar/);
  await page.getByRole('textbox').fill(totpCode(E2E.secret));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
}

test.describe('no credential material reaches browser storage (FR-051, SC-028)', () => {
  test('after the credential step alone', async ({ page }) => {
    // Checked mid-flow, holding a live challenge token. If anything cached it
    // to survive a reload, this is where it would show.
    await credentialStep(page, E2E.email);
    await expect(page).toHaveURL(/\/verificar/);
    assertNothingSensitive(await browserStorage(page));
  });

  test('after a complete sign-in', async ({ page }) => {
    await completeSignIn(page);
    assertNothingSensitive(await browserStorage(page));
  });

  test('after navigating around the product while signed in', async ({ page }) => {
    // A session that is USED, not merely created. Query caches and client
    // state accumulate as somebody moves, and this is where an over-eager
    // persistence layer would show up.
    await completeSignIn(page);
    await page.goto('/clientes');
    await page.goto('/expedientes');
    await page.goto('/');
    assertNothingSensitive(await browserStorage(page));
  });

  test('after a RELOAD — nothing was persisted to survive one', async ({ page }) => {
    // The strongest form. The session survives a reload because the cookie is
    // httpOnly and the server reads it; nothing in page-accessible storage
    // needs to, and if the session still works while storage stays empty,
    // that is the property proven rather than asserted.
    await completeSignIn(page);
    await page.reload();
    await expect(page.getByRole('navigation')).toBeVisible();
    assertNothingSensitive(await browserStorage(page));
  });

  test('after a REFUSED sign-in — the rejected credential is not kept either', async ({ page }) => {
    // Easy to miss. A form library restoring "what you typed" after an error
    // is a normal convenience and would put a password in sessionStorage.
    await credentialStep(page, E2E.email, 'una-contrasena-que-no-es');
    await expect(page.getByRole('alert')).toBeVisible();

    const stored = await browserStorage(page);
    expect(stored).not.toContain('una-contrasena-que-no-es');
    assertNothingSensitive(stored);
  });

  test('INDEXEDDB IS EMPTY — the storage area the component tests cannot see', async ({ page }) => {
    await completeSignIn(page);
    const databases = await page.evaluate(async () => {
      if (typeof indexedDB?.databases !== 'function') return [];
      return (await indexedDB.databases()).map((database) => database.name ?? '');
    });
    expect(databases).toEqual([]);
  });
});
