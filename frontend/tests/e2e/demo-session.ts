/**
 * ONE way to be signed in for an e2e suite: through `022`'s demo firm, once per suite.
 *
 * WHY A WORKER FIXTURE. The product refuses a TOTP code presented twice and throttles sign-in to
 * five attempts per origin per fifteen minutes. A suite that signed in per test would trip both
 * from its second test — five suites here have six to nine tests each. So the sign-in happens once
 * per worker, its `storageState` (the httpOnly session cookie) is saved, and every test of the suite
 * starts from it. Run suites one at a time (`--workers=1`) and a suite costs one sign-in attempt.
 *
 * WHO. `demoAs: 'default'` is `E2E_SIGNIN_*` (the demo MP); `demoAs: 'admin'` is `E2E_ADMIN_*` (the
 * demo SA), for the few assertions that read the firm's audit trail (`audit.read_own_tenant` is SA's
 * alone); `demoAs: 'billing'` is `E2E_BM_*` (the demo BM), the archetype that holds no case
 * capability at all; `demoAs: 'dual'` is `E2E_DUAL_*` (the one demo person in both firms). A suite chooses with `test.use({ demoAs: 'admin' })`.
 *
 * Replaces `principal.fixture.json` / `seeded-principal.ts`, which asserted an identity through
 * request headers — a mechanism `003` retired, after which every suite built on it landed on
 * `/ingresar` and failed without saying why.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { E2E, credentialStep, totpCode } from './auth-helpers';

export const BILLING = {
  email: process.env.E2E_BM_EMAIL ?? '',
  secret: process.env.E2E_BM_SECRET ?? '',
} as const;

export const DUAL = {
  email: process.env.E2E_DUAL_EMAIL ?? '',
  secret: process.env.E2E_DUAL_SECRET ?? '',
} as const;

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? '',
  secret: process.env.E2E_ADMIN_SECRET ?? '',
} as const;

/** The full sign-in ceremony, ending inside the shell. Shared by every signed-in suite. */
export async function signIn(page: Page, email = E2E.email, secret = E2E.secret): Promise<void> {
  await credentialStep(page, email);
  await expect(page).toHaveURL(/\/verificar/);
  await page.getByRole('textbox').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).not.toHaveURL(/\/(ingresar|verificar)/, { timeout: 15_000 });
  // A person in two firms is asked which one first; the demo identities used here have one.
  const picker = page.getByRole('heading', { name: 'Elige una firma' });
  if (await picker.isVisible().catch(() => false)) {
    await page.getByRole('button').first().click();
  }
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 15_000 });
}

interface DemoOptions {
  demoAs: 'default' | 'admin' | 'billing' | 'dual';
}

export const test = base.extend<object, DemoOptions & { demoStorageState: string }>({
  demoAs: ['default', { scope: 'worker', option: true }],
  demoStorageState: [
    async ({ browser, demoAs }, provide, workerInfo) => {
      const who = demoAs === 'admin' ? ADMIN : demoAs === 'billing' ? BILLING : demoAs === 'dual' ? DUAL : { email: E2E.email, secret: E2E.secret };
      // Keyed by the RUNNER's pid, not the worker's: Playwright replaces a worker after any failed
      // test, and a replacement that signed in again would present the same TOTP code inside the
      // same 30-second step — refused as a replay — and spend another of the five attempts. The
      // run's workers share one sign-in instead.
      const path = join(tmpdir(), `lc-e2e-${demoAs}-${process.ppid}.json`);
      // Fresh only: a pid can be reused by a later run, whose file would hold an old session.
      const fresh = existsSync(path) && Date.now() - statSync(path).mtimeMs < 10 * 60_000;
      if (!fresh) {
        // A worker fixture sees no test-scoped `baseURL`; the project's own setting is the same value.
        const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
        const page = await context.newPage();
        await signIn(page, who.email, who.secret);
        await context.storageState({ path });
        await context.close();
      }
      await provide(path);
    },
    { scope: 'worker' },
  ],
  storageState: async ({ demoStorageState }, provide) => {
    await provide(demoStorageState);
  },
});

export { expect };

/** True when the credentials a suite needs are configured — for its `test.skip`. */
export function demoConfigured(demoAs: DemoOptions['demoAs'] = 'default'): boolean {
  if (demoAs === 'admin') return Boolean(ADMIN.email && ADMIN.secret);
  if (demoAs === 'billing') return Boolean(BILLING.email && BILLING.secret);
  if (demoAs === 'dual') return Boolean(DUAL.email && DUAL.secret);
  return Boolean(E2E.email && E2E.secret);
}

export const DEMO_SKIP_REASON =
  'Set E2E_SIGNIN_EMAIL / E2E_SIGNIN_SECRET (and E2E_ADMIN_EMAIL / E2E_ADMIN_SECRET for suites that read the audit trail) to a person of 022\'s demo firm — `npm run db:seed:demo` prints them.';

/**
 * Calls the API as the signed-in person, through the frontend's own `/api/lc` proxy — the same path
 * the screens use, carrying the session cookie and the active firm, never an identity header.
 */
export async function api(page: Page): Promise<{ get: (path: string) => ReturnType<APIRequestContext['get']> }> {
  const memberships = await page.request.get('/api/lc/identity/memberships');
  expect(memberships.status(), 'the signed-in person can list their own memberships').toBe(200);
  const body = (await memberships.json()) as { items: { tenantId: string }[] };
  const tenantId = body.items[0]!.tenantId;
  return {
    get: (path: string) => page.request.get(`/api/lc${path}`, { headers: { 'x-tenant-id': tenantId } }),
  };
}
