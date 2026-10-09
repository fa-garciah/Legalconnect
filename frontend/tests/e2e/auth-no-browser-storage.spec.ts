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
 *
 * ONE SIGNED-IN SESSION FOR THE WHOLE SUITE (2026-10-09). The four signed-in checks used to sign
 * in once each, within seconds: the product refuses a TOTP code presented twice, and throttles
 * sign-in to five attempts per origin per fifteen minutes, so in a single run every check after
 * the first failed on the challenge rather than on storage. They now share one page, signed in
 * once in `beforeAll`, and run in order — which is also the realistic sequence: sign in, move
 * around, reload. The suite costs three sign-in attempts in total: the credential step alone, the
 * refused one, and the shared complete one.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E, SKIP_REASON, browserStorage, credentialStep } from './auth-helpers';
import { signIn } from './demo-session';

test.skip(!E2E.email || !E2E.secret, SKIP_REASON);
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only — one sign-in per TOTP step');
});

/** Everything that must never appear, whatever the flow. */
function assertNothingSensitive(stored: string): void {
  expect(stored).not.toContain(E2E.password);
  expect(stored).not.toContain(E2E.secret);

  const lowered = stored.toLowerCase();
  for (const forbidden of ['accesstoken', 'refreshtoken', 'challengetoken', 'enrollmenttoken', 'backup']) {
    expect(lowered, `browser storage mentions ${forbidden}`).not.toContain(forbidden);
  }
}

/**
 * IndexedDB databases the PRODUCT created. Next's development server opens its own
 * (`__next_debug_channel`) to talk to its dev overlay; it holds no application data and does not
 * exist in a production build, so a name starting with `__next` is the framework's, not ours.
 * Anything else fails the test.
 */
async function productDatabases(page: Page): Promise<string[]> {
  const names = await page.evaluate(async () => {
    if (typeof indexedDB?.databases !== 'function') return [];
    return (await indexedDB.databases()).map((database) => database.name ?? '');
  });
  return names.filter((name) => !name.startsWith('__next'));
}

test.describe('no credential material reaches browser storage (FR-051, SC-028)', () => {
  test('after the credential step alone', async ({ page }) => {
    // Checked mid-flow, holding a live challenge token. If anything cached it
    // to survive a reload, this is where it would show.
    await credentialStep(page, E2E.email);
    await expect(page).toHaveURL(/\/verificar/);
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

  test.describe('signed in — one session, in order', () => {
    test.describe.configure({ mode: 'serial' });

    let context: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }, testInfo) => {
      if (testInfo.project.name !== 'desktop') return;
      context = await browser.newContext();
      page = await context.newPage();
      await signIn(page);
    });

    test.afterAll(async () => {
      await context?.close();
    });

    test('after a complete sign-in', async () => {
      assertNothingSensitive(await browserStorage(page));
    });

    test('after navigating around the product while signed in', async () => {
      // A session that is USED, not merely created. Query caches and client
      // state accumulate as somebody moves, and this is where an over-eager
      // persistence layer would show up.
      await page.goto('/clientes');
      await page.goto('/expedientes');
      await page.goto('/');
      assertNothingSensitive(await browserStorage(page));
    });

    test('after a RELOAD — nothing was persisted to survive one', async () => {
      // The strongest form. The session survives a reload because the cookie is
      // httpOnly and the server reads it; nothing in page-accessible storage
      // needs to, and if the session still works while storage stays empty,
      // that is the property proven rather than asserted.
      await page.reload();
      await expect(page.getByRole('navigation')).toBeVisible();
      assertNothingSensitive(await browserStorage(page));
    });

    test('INDEXEDDB HOLDS NOTHING OF OURS — the storage area the component tests cannot see', async () => {
      expect(await productDatabases(page)).toEqual([]);
    });
  });
});
