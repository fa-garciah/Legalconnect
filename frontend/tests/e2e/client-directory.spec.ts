/**
 * T023 — 018/US1, quickstart Scenario 2, in a real browser.
 *
 * **What this tier adds over the component tests.** `ClientDirectory.test.tsx` already
 * covers the columns, the states and the no-local-filtering rule against a mocked `fetch`.
 * Repeating that here would be slower and no more convincing. What only a browser can show
 * is the part the component tier stubs away: a real request crossing to `006`, carrying the
 * tenant and identity headers `apiFetch` attaches, and coming back through RLS — and the
 * CSS actually applying, which jsdom cannot evaluate at all.
 *
 * **The row worth the wiring** is the full-filtered-page one. `006` filters inside the
 * query, before the page boundary, so a filtered page arrives complete. A screen that
 * filters again shortens pages while "Cargar más" still promises more — invisible until
 * someone pages through a filtered set, and invisible to `006`'s own tests because the
 * defect is on this side of the wire.
 *
 * **Prerequisites** (quickstart.md): the backend on 3001, migrated and seeded, and
 * `src/session/principal.fixture.json` pointing at a real seeded identity and tenant. With
 * the default fixture the directory renders a refusal rather than data — which is correct
 * behaviour, and is why the first test here checks the seam before anything else does.
 */
import { test, expect, type Page } from '@playwright/test';

/** One per client. The directory is a card grid; each card is an `article`. */
function dataRows(page: Page) {
  return page.getByRole('article');
}

async function openDirectory(page: Page): Promise<void> {
  await page.goto('/clientes');
  // Either data or a state — but the page must resolve to something, not hang.
  await expect(
    page
      .getByRole('article')
      .first()
      .or(page.getByTestId('empty-state'))
      .or(page.getByTestId('error-state')),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('the client directory against a running backend', () => {
  test('reaches 006 and resolves to a real state', async ({ page }) => {
    // The seam check, first, because everything below depends on it. A failure here is
    // almost always the fixture or the port, not the screen — see quickstart Prerequisites.
    await openDirectory(page);

    const error = page.getByTestId('error-state');
    if (await error.isVisible()) {
      // Fail loudly and say why, rather than letting the later tests fail obscurely.
      const text = (await error.textContent()) ?? '';
      throw new Error(
        `The directory refused rather than loading. Check that the backend is on 3001 and ` +
          `that principal.fixture.json names a seeded identity and tenant. Screen said: ${text}`,
      );
    }
  });

  test('renders the record on each client card', async ({ page }) => {
    await openDirectory(page);
    test.skip(await page.getByTestId('empty-state').isVisible(), 'no seeded clients in this tenant');

    // Every field `006` actually returns, on the first card. The design's email, telephone
    // and case-count rows are absent because the API has no such fields — see ClientCard.
    const card = page.getByRole('article').first();
    await expect(card.getByText('RFC:')).toBeVisible();
    // Type is carried by the icon and the subtitle, status by the badge — see ClientCard
    // for why the design's email / telephone / responsible rows are absent.
    await expect(card.getByText(/Organizaci|Persona/)).toBeVisible();
    await expect(card.getByText(/Activo|Retirado/)).toBeVisible();
  });

  test('filters through the server and keeps the page full while more matches remain', async ({
    page,
  }) => {
    // FR-003, and the assertion quickstart Scenario 2 singles out. The filter is applied by
    // 006 before the page boundary, so while "Cargar más" is offered the page must be a
    // FULL page of matches. A screen that re-filtered locally would show fewer.
    await openDirectory(page);
    test.skip(await page.getByTestId('empty-state').isVisible(), 'no seeded clients in this tenant');

    const unfiltered = await dataRows(page).count();

    const box = page.getByRole('searchbox', { name: /buscar/i });
    // A single letter, so the filter is broad enough to leave more than one page behind.
    await box.fill('a');
    // Wait for the debounce and the round trip to settle before counting anything.
    await page.waitForResponse(
      (response) => response.url().includes('/tenant/clients') && response.url().includes('q=a'),
      { timeout: 10_000 },
    );
    await expect(page.getByTestId('loading-state')).toHaveCount(0, { timeout: 10_000 });

    const loadMore = page.getByRole('button', { name: /cargar m[aá]s/i });
    if (await loadMore.isVisible()) {
      const filteredPage = await dataRows(page).count();
      // "Cargar más" is showing, so 006 said there is another page — which means this one
      // is a complete page, not a remnant left after local filtering.
      expect(filteredPage).toBe(unfiltered);

      await loadMore.click();
      await expect.poll(async () => dataRows(page).count(), { timeout: 10_000 }).toBeGreaterThan(filteredPage);
    }
  });

  test('restores the whole directory when the search box is cleared', async ({ page }) => {
    await openDirectory(page);
    test.skip(await page.getByTestId('empty-state').isVisible(), 'no seeded clients in this tenant');

    const unfiltered = await dataRows(page).count();
    const box = page.getByRole('searchbox', { name: /buscar/i });

    await box.fill('zzzzzzzz');
    await expect(page.getByTestId('empty-state')).toBeVisible({ timeout: 5_000 });

    await box.fill('');
    await expect.poll(async () => dataRows(page).count(), { timeout: 5_000 }).toBe(unfiltered);
  });

  test('names what was searched when nothing matched, and offers a way out', async ({ page }) => {
    await openDirectory(page);

    await page.getByRole('searchbox', { name: /buscar/i }).fill('zzzzzzzz');

    const guidance = page.getByTestId('empty-state-guidance');
    await expect(guidance).toBeVisible({ timeout: 5_000 });
    await expect(guidance).toContainText('zzzzzzzz');

    await page.getByRole('button', { name: /limpiar/i }).click();
    await expect(page.getByRole('searchbox', { name: /buscar/i })).toHaveValue('');
  });

  test('is reachable from the navigation menu', async ({ page }) => {
    // The registry's first real entry. This is the only tier that proves the shell actually
    // renders it and that the link goes where it claims — and, below `lg`, that the drawer
    // is the way to it rather than the rail.
    await page.goto('/');

    const rail = page.getByTestId('shell-nav');
    if (!(await rail.isVisible())) {
      await page.getByRole('button', { name: /abrir navegación/i }).click();
      await expect(page.getByTestId('shell-nav-mobile')).toBeVisible();
    }

    await page.getByRole('link', { name: 'Clientes' }).click();
    await expect(page).toHaveURL(/\/clientes$/);
  });

  test('shows the sections that are not built yet without offering them as links', async ({
    page,
  }) => {
    // The rail lists the whole product so its shape is legible. The nine sections without a
    // route are rendered and are NOT links — a menu item that 404s is worse than one that is
    // honestly marked as not built.
    await page.goto('/clientes');

    // Both navs are in the DOM below `lg` — the rail hidden by CSS, the drawer unmounted
    // until opened. Scope to whichever one is actually on screen, or the query matches two.
    const rail = page.getByTestId('shell-nav');
    let nav = rail;
    if (!(await rail.isVisible())) {
      await page.getByRole('button', { name: /abrir navegación/i }).click();
      nav = page.getByTestId('shell-nav-mobile');
      await expect(nav).toBeVisible();
    }

    const expedientes = nav.getByTestId('nav-item-expedientes');
    await expect(expedientes).toBeVisible();
    await expect(expedientes).toHaveAttribute('data-unavailable', 'true');
    // Not an anchor, so there is nothing to click through to and nothing to tab onto.
    expect(await expedientes.evaluate((el) => el.tagName)).toBe('SPAN');

    // And the one that IS built is a link, marked as the current page.
    await expect(nav.getByTestId('nav-item-clientes')).toHaveAttribute('aria-current', 'page');
  });

  test('the brand reaches the screen through the theme, not a colour literal', async ({ page }) => {
    // research D3, and the one assertion that needs a real CSS engine — jsdom resolves no
    // utilities at all, so `theme-tokens.test.tsx` can only read the stylesheet as text.
    await openDirectory(page);

    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
    );
    expect(primary.toLowerCase()).toContain('3730a3');
  });

  test('the filter, the page and the scroll position all survive opening a record', async ({
    page,
  }) => {
    /*
     * T048 — SC-014, FR-027, and the assertion the whole route decision rests on.
     *
     * A client's record is a dialog over the directory rather than a `/clientes/[id]`
     * route. The prototype had the route; it was deliberately not ported. What that buys is
     * exactly this: someone three pages into a filtered directory can open a record, close
     * it, and still be where they were. With a route they would come back to page one of an
     * unfiltered list and have to find their place again — which, on a directory of any
     * size, is the difference between correcting five records and correcting one.
     *
     * The accepted cost is that no individual client has a shareable link. If this test
     * ever fails, the trade was paid for and nothing was bought, and the route should be
     * reconsidered rather than this test relaxed.
     */
    await openDirectory(page);
    test.skip(await page.getByTestId('empty-state').isVisible(), 'no seeded clients in this tenant');

    // A filter narrow enough to be obviously in effect, broad enough to match something.
    const box = page.getByRole('searchbox', { name: /buscar/i });
    await box.fill('a');
    await page.waitForResponse(
      (response) => response.url().includes('/tenant/clients') && response.url().includes('q=a'),
      { timeout: 10_000 },
    );

    /*
     * Page forward as far as the data allows, so the state being preserved is a real one.
     *
     * The wait is on the card count, not on the button. "Cargar más" is *removed* when the
     * last page arrives, so waiting for it to re-enable fails on the final iteration — the
     * assertion runs against an element that no longer exists. The count going up is the
     * thing actually being waited for, and it is true whether or not another page follows.
     */
    const loadMore = page.getByRole('button', { name: /cargar m[aá]s/i });
    let pages = 1;
    while ((await loadMore.isVisible()) && pages < 3) {
      const before = await dataRows(page).count();
      await loadMore.click();
      await expect.poll(async () => dataRows(page).count(), { timeout: 10_000 }).toBeGreaterThan(before);
      pages += 1;
    }

    const rowsBefore = await dataRows(page).count();

    const edit = page.getByRole('button', { name: /^editar/i }).last();
    test.skip(!(await edit.isVisible()), 'this archetype holds no client.update');

    /*
     * Scroll the target into view FIRST, then read the position, then click.
     *
     * Playwright scrolls an element into view as part of clicking it. Scrolling the page by
     * hand and then clicking something above the fold therefore moves the page back before
     * the dialog ever opens — the test destroys the position it is about to assert on, and
     * reports it as a product defect. Measured: latched 0 where the test believed 400.
     *
     * Taking the last card's control puts the page near the bottom, which is a real place
     * to be reading from and one Playwright will not move away from.
     */
    await edit.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await edit.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // The filter is still applied…
    await expect(box).toHaveValue('a');
    /*
     * …every page that was loaded is still loaded…
     *
     * `>=`, not `toBe`, and the reason is not laziness. `client-intake.spec.ts` and
     * `client-withdraw-restore.spec.ts` register clients into this same tenant, and
     * Playwright runs spec files in parallel, so the directory can legitimately gain a row
     * mid-test. Exact equality made this test fail about one run in four for a reason that
     * had nothing to do with what it checks.
     *
     * The defect it is looking for moves the count the other way: a dialog that reset the
     * query would drop back to page one and show FEWER rows. `>=` catches that and ignores
     * the noise.
     */
    expect(await dataRows(page).count()).toBeGreaterThanOrEqual(rowsBefore);
    // …and the viewport did not jump back to the top.
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(50);
  });
});
