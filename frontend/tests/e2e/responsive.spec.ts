/**
 * T049 (016a) — SC-011, FR-021. Every control in the shell is reachable and usable at both
 * the desktop and mobile Playwright projects (playwright.config.ts).
 *
 * **Extended by 018/T055**, not duplicated. `018` adds the product's first real screen — a
 * four-column table and two dialogs — and a table is the single most common source of a
 * page that scrolls sideways on a phone. Both projects run every test in this file, so each
 * case below is executed at both viewports without being written twice.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Whether the page itself scrolls sideways.
 *
 * A one-pixel tolerance, because sub-pixel layout rounding produces a `scrollWidth` a
 * fraction larger than `clientWidth` on elements that are visually flush.
 *
 * Content wider than the viewport is allowed — the table is inside its own
 * `overflow-x: auto` container and is *meant* to scroll. What is not allowed is the page
 * BODY scrolling, which drags the header and navigation off screen and leaves no obvious
 * way back.
 */
/**
 * Reveals the navigation, whichever form this viewport uses.
 *
 * From `lg` up the rail is always on screen. Below it the same rail is a drawer behind the
 * header's menu button — which is what SC-011 asks for: reachable and usable at every
 * viewport, not identically laid out at every viewport. Returns the nav that is actually
 * visible, so a caller can assert against it without knowing which one it got.
 */
async function revealNavigation(page: Page) {
  const rail = page.getByTestId('shell-nav');
  if (await rail.isVisible()) return rail;

  await page.getByRole('button', { name: /abrir navegación/i }).click();
  const drawer = page.getByTestId('shell-nav-mobile');
  await expect(drawer).toBeVisible();
  return drawer;
}

async function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth > 1;
  });
}

test.describe('the shell is usable at every configured viewport', () => {
  test('the header is visible and the navigation menu is reachable', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('shell-header')).toBeVisible();
    await expect(page.getByTestId('page-content')).toBeVisible();

    // The rail on a wide screen, the drawer on a narrow one — and on both, the navigation
    // must actually be reachable rather than merely present in the DOM.
    const nav = await revealNavigation(page);
    await expect(nav.getByRole('link', { name: 'Clientes' })).toBeVisible();
  });

  test('the client directory does not scroll the page sideways', async ({ page }) => {
    // 018/SC-010. The grid is three columns on a wide screen and one on a phone, beside a
    // 288px fixed rail — the two together are the most likely thing to push the body out.
    await page.goto('/clientes');
    await expect(
      page
        .getByRole('article')
        .first()
        .or(page.getByTestId('empty-state'))
        .or(page.getByTestId('error-state')),
    ).toBeVisible({ timeout: 15_000 });

    expect(await pageScrollsSideways(page)).toBe(false);
  });

  test('the filters stay usable at both viewports', async ({ page }) => {
    // They sit side by side on a wide screen and stack on a narrow one; either way both
    // must be operable, not merely present.
    await page.goto('/clientes');
    await expect(
      page
        .getByRole('article')
        .first()
        .or(page.getByTestId('empty-state'))
        .or(page.getByTestId('error-state')),
    ).toBeVisible({ timeout: 15_000 });

    const search = page.getByRole('searchbox', { name: /buscar/i });
    await expect(search).toBeVisible();
    await search.fill('a');
    await expect(search).toHaveValue('a');

    await expect(page.getByRole('combobox', { name: /estado/i })).toBeVisible();
  });

  test('the form dialog fits the viewport', async ({ page }) => {
    await page.goto('/clientes');
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15_000 });

    const create = page.getByRole('button', { name: /nuevo cliente/i });
    test.skip(!(await create.isVisible()), 'this archetype holds no client.create');
    await create.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Both fields reachable without the page itself having to move sideways.
    await expect(dialog.getByLabel(/razón social/i)).toBeVisible();
    await expect(dialog.getByLabel(/RFC/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^guardar$/i })).toBeVisible();

    expect(await pageScrollsSideways(page)).toBe(false);
  });

  test('the confirmation dialog fits the viewport', async ({ page }) => {
    await page.goto('/clientes');
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15_000 });

    const withdraw = page.getByRole('button', { name: /^retirar/i }).first();
    test.skip(!(await withdraw.isVisible()), 'this archetype holds no client.deactivate');
    await withdraw.click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    // The two-sentence consequence is the longest copy in the slice and the most likely to
    // overflow on a narrow screen.
    await expect(confirm).toContainText(/asuntos existentes no se ven afectados/i);
    await expect(confirm.getByRole('button', { name: /cancelar/i })).toBeVisible();

    expect(await pageScrollsSideways(page)).toBe(false);
  });

  test('the case register does not scroll the page sideways', async ({ page }) => {
    /*
     * 019/SC-009, and the harder case of the two. The client directory is a card grid that
     * reflows; this is a **six-column table** beside a 288px fixed rail. On a phone it is
     * comfortably wider than the viewport, which is exactly why it lives in its own scroll
     * container rather than pushing the body out.
     */
    await page.goto('/expedientes');
    await expect(
      page.getByRole('table').or(page.getByTestId('empty-state')).or(page.getByTestId('error-state')),
    ).toBeVisible({ timeout: 15_000 });

    expect(await pageScrollsSideways(page)).toBe(false);
  });

  test('the case filters stay usable at both viewports', async ({ page }) => {
    // Three controls that sit in a row on a wide screen and stack on a narrow one. Either
    // way all three must be operable, not merely present.
    await page.goto('/expedientes');
    await expect(
      page.getByRole('table').or(page.getByTestId('empty-state')).or(page.getByTestId('error-state')),
    ).toBeVisible({ timeout: 15_000 });

    const search = page.getByRole('searchbox', { name: /buscar/i });
    await expect(search).toBeVisible();
    await search.fill('EXP');
    await expect(search).toHaveValue('EXP');

    await expect(page.getByRole('combobox', { name: 'Tipo' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Juzgado' })).toBeVisible();
  });

  test('the case detail panel fits the viewport', async ({ page }) => {
    await page.goto('/expedientes');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });

    /*
     * Scoped to the table. Unscoped, `/^abrir /i` also matches the header's "Abrir
     * navegación" — the mobile menu button, which is visible below `lg` and comes first in
     * the DOM. The test then opens the navigation drawer and waits forever for a case team
     * that was never going to appear. Found by the mobile project; the desktop one hides
     * that button, so it passed.
     */
    const open = page.getByRole('table').getByRole('button', { name: /^abrir /i }).first();
    test.skip(!(await open.isVisible()), 'this archetype holds no case.read, or there are no matters');
    await open.click();

    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('case-team')).toBeVisible({ timeout: 10_000 });

    expect(await pageScrollsSideways(page)).toBe(false);
  });

  test('the new-matter form fits the viewport', async ({ page }) => {
    await page.goto('/expedientes');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });

    const create = page.getByRole('button', { name: /nuevo expediente/i });
    test.skip(!(await create.isVisible()), 'this archetype holds no case.create');
    await create.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The form is the tallest thing in the slice — seven fields — and the one most likely
    // to overflow rather than scroll inside itself.
    await expect(dialog.getByLabel(/número de expediente/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^guardar$/i })).toBeVisible();

    expect(await pageScrollsSideways(page)).toBe(false);
  });
});
