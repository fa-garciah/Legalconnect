/**
 * T040 — 018/US3, quickstart Scenario 4, against a running backend.
 *
 * **The round trip is the point.** `006/FR-004a` exists so a mis-click is cheap: withdraw,
 * then restore, and the client is usable again. Each half is easy to get right on its own
 * and the pair is where the mistakes live — a restore that does not re-enable, a row that
 * keeps showing the old status because the list was patched instead of re-read.
 *
 * **On the audit assertion.** `006`'s SC-007b requires two distinct entries,
 * `client.deactivated` then `client.reactivated`. Reading the audit log needs
 * `audit.read_own_tenant`, which `004` gives to `SA` alone — and the seeded identity these
 * tests run as is `MP` in tenant A. So the check below runs only when the configured
 * fixture happens to hold it, and says so out loud when it does not, rather than quietly
 * passing. It is not the only thing holding that guarantee: `006`'s own
 * `tests/contract/client-audit.test.ts` asserts it directly, at the tier that can see the
 * table.
 *
 * **Prerequisites** (quickstart.md): backend on 3001, migrated and seeded, and
 * `principal.fixture.json` pointing at a seeded identity holding `client.deactivate` —
 * `MP`, `BM` or `SA`. Not `PL`, which is `006`'s Q1 and is asserted at the component tier.
 *
 * **This test writes** and leaves its client behind; `006` has no delete, deliberately.
 */
import { test, expect, type Page } from '@playwright/test';
import fixture from '../../src/session/principal.fixture.json';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

function uniqueName(prefix: string): string {
  return `${prefix} ${process.pid}-${test.info().workerIndex}-${test.info().repeatEachIndex}`;
}

function dialog(page: Page) {
  return page.getByRole('dialog');
}

async function openDirectory(page: Page): Promise<void> {
  await page.goto('/clientes');
  await expect(
    page
      .getByRole('article')
      .first()
      .or(page.getByTestId('empty-state'))
      .or(page.getByTestId('error-state')),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('error-state')).toHaveCount(0);
}

/** Registers a client through the UI and returns its name. */
async function register(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /nuevo cliente/i }).click();
  await dialog(page).getByLabel(/razón social/i).fill(name);
  await dialog(page).getByRole('radio', { name: /organizaci/i }).click();
  await dialog(page).getByRole('button', { name: /^guardar$/i }).click();
  await expect(dialog(page)).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
}

function rowFor(page: Page, name: string) {
  return page.getByRole('article', { name });
}

test.describe('withdrawing a client and undoing it', () => {
  test('the confirmation states both halves of what withdrawal does', async ({ page }) => {
    await openDirectory(page);
    const name = uniqueName('Retirable E2E');
    await register(page, name);

    await page.getByRole('button', { name: new RegExp(`retirar ${name}`, 'i') }).click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(/no podrá usarse en nuevos asuntos/i);
    // 006/FR-008. Without this sentence a narrow, reversible change reads as deletion.
    await expect(confirm).toContainText(/asuntos existentes no se ven afectados/i);
  });

  test('cancelling changes nothing', async ({ page }) => {
    await openDirectory(page);
    const name = uniqueName('Cancelable E2E');
    await register(page, name);

    await page.getByRole('button', { name: new RegExp(`retirar ${name}`, 'i') }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /cancelar/i }).click();

    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(rowFor(page, name).getByText('Activo')).toBeVisible();
  });

  test('withdraw then restore returns the client to active', async ({ page }) => {
    await openDirectory(page);
    const name = uniqueName('Round Trip E2E');
    await register(page, name);

    await page.getByRole('button', { name: new RegExp(`retirar ${name}`, 'i') }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /^retirar$/i }).click();

    // The row re-reads rather than being patched, so this is 006's answer, not a guess.
    await expect(rowFor(page, name).getByText('Retirado')).toBeVisible({ timeout: 10_000 });
    // The row's own control now points the other way.
    await expect(page.getByRole('button', { name: new RegExp(`restaurar ${name}`, 'i') })).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`restaurar ${name}`, 'i') }).click();

    // No confirmation on the undo (FR-013).
    await expect(rowFor(page, name).getByText('Activo')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: new RegExp(`retirar ${name}`, 'i') })).toBeVisible();
  });

  test('a withdrawn client is still listed, not hidden', async ({ page }) => {
    // 006/contracts/client-api.md §1. Withdrawal bars new matters; it does not remove the
    // record from a firm that still has open ones against that party.
    await openDirectory(page);
    const name = uniqueName('Sigue Visible E2E');
    await register(page, name);

    await page.getByRole('button', { name: new RegExp(`retirar ${name}`, 'i') }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /^retirar$/i }).click();
    await expect(rowFor(page, name).getByText('Retirado')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(name)).toBeVisible();
  });

  test('the round trip leaves two distinct audit entries', async ({ page, request }) => {
    const identityId = fixture.identityId;
    const tenantId = fixture.memberships[0]?.tenantId;
    const headers = { 'x-identity-id': identityId, 'x-tenant-id': tenantId ?? '' };

    const probe = await request.get(`${API_BASE}/audit/events?limit=1`, { headers });
    test.skip(
      probe.status() !== 200,
      `the configured fixture does not hold audit.read_own_tenant (got ${probe.status()}); ` +
        `006/tests/contract/client-audit.test.ts asserts SC-007b directly at the tier that can see the table`,
    );

    await openDirectory(page);
    const name = uniqueName('Auditada E2E');
    await register(page, name);

    await page.getByRole('button', { name: new RegExp(`retirar ${name}`, 'i') }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /^retirar$/i }).click();
    await expect(rowFor(page, name).getByText('Retirado')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: new RegExp(`restaurar ${name}`, 'i') }).click();
    await expect(rowFor(page, name).getByText('Activo')).toBeVisible({ timeout: 10_000 });

    const response = await request.get(`${API_BASE}/audit/events?limit=50`, { headers });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: { action: string }[] };
    const actions = body.items.map((item) => item.action);

    // Two distinct actions, not one `client.updated` carrying a status field — 006/FR-004a
    // requires the round trip to be legible in the trail.
    expect(actions).toContain('client.deactivated');
    expect(actions).toContain('client.reactivated');
  });
});
