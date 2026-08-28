/**
 * T032 — 018/US2, quickstart Scenario 3, against a running backend.
 *
 * **What this tier adds.** `ClientFormDialog.test.tsx` already covers validation timing,
 * the no-request-when-invalid rule and `kind` immutability against a mocked `fetch`. What
 * only a real backend can show is that the payload this form builds is one `006` actually
 * accepts — including the `kind`-omission on edit, which against a mock is an assertion
 * about a JSON body and here is the difference between a save and a `400`.
 *
 * It also covers FR-011, which has no meaning below this tier: the directory updating
 * without a manual reload. That is a claim about two components and a query cache
 * cooperating, and mounting the dialog alone cannot observe it.
 *
 * **Prerequisites** (quickstart.md): the backend on 3001, migrated and seeded, and
 * `src/session/principal.fixture.json` pointing at a seeded identity whose archetype holds
 * `client.create` and `client.update` — MP, PL, BM or SA.
 *
 * **This test writes.** Each run registers a client with a unique name and leaves it in the
 * seeded tenant; `006` has no delete, deliberately, so cleanup is not available and is not
 * attempted. Re-seeding resets the tenant.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * The form's own fields, scoped to the dialog.
 *
 * The directory's search box is labelled "Buscar por razón social" and the form's field is
 * labelled "Razón social", so an unscoped label lookup matches both — the two live on the
 * page at the same time. Scoping is not a workaround: a form field lookup that could match
 * something outside the form is ambiguous by construction.
 */
function dialog(page: Page) {
  return page.getByRole('dialog');
}

/** Unique per run, so a re-run does not depend on what the previous one left behind. */
function uniqueName(prefix: string): string {
  return `${prefix} ${process.pid}-${test.info().workerIndex}-${test.info().repeatEachIndex}`;
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

test.describe('registering and correcting a client', () => {
  test('the create control is present for a permitted archetype', async ({ page }) => {
    await openDirectory(page);
    await expect(page.getByRole('button', { name: /nuevo cliente/i })).toBeVisible();
  });

  test('an empty form reports every problem and sends nothing', async ({ page }) => {
    await openDirectory(page);

    let requests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/tenant/clients')) requests += 1;
    });

    await page.getByRole('button', { name: /nuevo cliente/i }).click();
    await dialog(page).getByRole('button', { name: /^guardar$/i }).click();

    await expect(page.getByText(/Ingresa la razón social/i)).toBeVisible();
    await expect(page.getByText(/Selecciona el tipo de cliente/i)).toBeVisible();
    // SC-003 — the round trip that would have said less than the screen already does.
    expect(requests).toBe(0);
  });

  test('a registered client appears in the directory with no manual reload', async ({ page }) => {
    // FR-011. The list query is invalidated rather than patched, so what appears is what
    // 006 actually holds — not what the browser hoped it would hold.
    await openDirectory(page);
    const name = uniqueName('Cliente E2E');

    await page.getByRole('button', { name: /nuevo cliente/i }).click();
    await dialog(page).getByLabel(/razón social/i).fill(name);
    await dialog(page).getByRole('radio', { name: /persona/i }).click();
    await dialog(page).getByRole('button', { name: /^guardar$/i }).click();

    // No page.reload() anywhere in this test, deliberately.
    await expect(dialog(page)).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
  });

  test('a client registered without an RFC shows a dash, not an empty cell', async ({ page }) => {
    await openDirectory(page);
    const name = uniqueName('Sin RFC E2E');

    await page.getByRole('button', { name: /nuevo cliente/i }).click();
    await dialog(page).getByLabel(/razón social/i).fill(name);
    await dialog(page).getByRole('radio', { name: /organizaci/i }).click();
    // RFC left blank: the empty string must reach 006 as null, or the row shows '' and the
    // directory looks broken rather than incomplete.
    await dialog(page).getByRole('button', { name: /^guardar$/i }).click();

    await expect(dialog(page)).toBeHidden({ timeout: 10_000 });
    const card = page.getByRole('article', { name });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('—')).toBeVisible();
  });

  test('editing saves — which proves kind was omitted from the payload', async ({ page }) => {
    /*
     * **The assertion this file exists for.** Against a mock, "the body has no `kind`" is a
     * statement about a JSON object. Here it is the difference between a `200` and a `400`:
     * `006` refuses a PATCH naming `kind` even with an unchanged value, so an
     * implementation that spread the loaded record into the body would fail this save and
     * every other one, while passing every unit test that only checked the visible fields.
     */
    await openDirectory(page);
    const name = uniqueName('Editable E2E');

    await page.getByRole('button', { name: /nuevo cliente/i }).click();
    await dialog(page).getByLabel(/razón social/i).fill(name);
    await dialog(page).getByRole('radio', { name: /organizaci/i }).click();
    await dialog(page).getByRole('button', { name: /^guardar$/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: new RegExp(`editar ${name}`, 'i') }).click();

    await expect(dialog(page)).toBeVisible();
    // FR-010: read-only text on edit, so there is no control to change it with.
    await expect(dialog(page).getByRole('radio')).toHaveCount(0);
    await expect(dialog(page).getByText(/Organizaci/i)).toBeVisible();

    const corrected = `${name} Corregido`;
    await dialog(page).getByLabel(/razón social/i).fill(corrected);
    await dialog(page).getByRole('button', { name: /^guardar$/i }).click();

    // Saved, so the payload was one 006 accepts.
    await expect(dialog(page)).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(corrected)).toBeVisible({ timeout: 10_000 });
  });

  test('the dialog returns focus to the control that opened it', async ({ page }) => {
    // FR-025/FR-026, and the one accessibility property a dialogs-and-forms slice most
    // often loses: closing with Escape leaves focus on the body, and a keyboard user is
    // dropped back at the top of the document.
    await openDirectory(page);

    const trigger = page.getByRole('button', { name: /nuevo cliente/i });
    await trigger.focus();
    await trigger.press('Enter');
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();

    await expect(trigger).toBeFocused();
  });
});
