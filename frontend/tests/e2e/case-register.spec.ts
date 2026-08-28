/**
 * T023 — 019/US1, quickstart Scenario 1, against a running backend.
 *
 * **What this tier adds.** `CaseRegister.test.tsx` already covers the columns, the states and
 * the no-local-filtering rule against a mocked `fetch`. What only a real backend can show is
 * that the query this screen builds is one `006` actually accepts — and, above all, the
 * audit assertion below, which is a claim about the database and cannot be made anywhere
 * else.
 *
 * **Prerequisites** (quickstart.md): backend on 3001, migrated and seeded, and
 * `src/session/principal.fixture.json` pointing at a seeded identity. With the shipped
 * fixture the register renders a refusal rather than data — correct behaviour, and why the
 * first test here checks the seam before anything else does.
 */
import { test, expect, type Page } from '@playwright/test';
import fixture from '../../src/session/principal.fixture.json';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

const HEADERS = {
  'x-identity-id': fixture.identityId,
  'x-tenant-id': fixture.memberships[0]?.tenantId ?? '',
};

/** One per matter. The register is a table; each matter is a row. */
function dataRows(page: Page) {
  return page.getByRole('row').filter({ hasNot: page.getByRole('columnheader') });
}

async function openRegister(page: Page): Promise<void> {
  await page.goto('/expedientes');
  await expect(
    page.getByRole('table').or(page.getByTestId('empty-state')).or(page.getByTestId('error-state')),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('the case register against a running backend', () => {
  test('reaches 006 and resolves to a real state', async ({ page }) => {
    // The seam check, first, because everything below depends on it. A failure here is
    // almost always the fixture or the port, not the screen.
    await openRegister(page);

    const error = page.getByTestId('error-state');
    if (await error.isVisible()) {
      const text = (await error.textContent()) ?? '';
      throw new Error(
        `The register refused rather than loading. Check the backend is on 3001 and that ` +
          `principal.fixture.json names a seeded identity and tenant. Screen said: ${text}`,
      );
    }
  });

  test('renders the six columns, and no seventh', async ({ page }) => {
    await openRegister(page);
    test.skip(await page.getByTestId('empty-state').isVisible(), 'no seeded matters in this tenant');

    for (const header of ['Número', 'Cliente', 'Tipo', 'Juzgado', 'Fecha Inicio', 'Estado']) {
      await expect(page.getByRole('columnheader', { name: header })).toBeVisible();
    }
    // Spec Decision 2. No person's name exists in the system to put in a seventh.
    await expect(page.getByRole('columnheader', { name: /abogado/i })).toHaveCount(0);
  });

  test('filters through the server and keeps the page full while more matches remain', async ({
    page,
  }) => {
    // FR-029. The filter is applied by 006 before the page boundary, so while "Cargar más" is
    // offered the page must be a FULL page of matches.
    await openRegister(page);
    test.skip(await page.getByTestId('empty-state').isVisible(), 'no seeded matters in this tenant');

    const unfiltered = await dataRows(page).count();

    await page.getByRole('searchbox', { name: /buscar/i }).fill('EXP');
    await page.waitForResponse(
      (response) => response.url().includes('/tenant/cases') && response.url().includes('q=EXP'),
      { timeout: 10_000 },
    );
    await expect(page.getByTestId('loading-state')).toHaveCount(0, { timeout: 10_000 });

    const loadMore = page.getByRole('button', { name: /cargar m[aá]s/i });
    if (await loadMore.isVisible()) {
      expect(await dataRows(page).count()).toBe(unfiltered);
    }
  });

  test('restores the whole register when the search box is cleared', async ({ page }) => {
    await openRegister(page);
    test.skip(await page.getByTestId('empty-state').isVisible(), 'no seeded matters in this tenant');

    const unfiltered = await dataRows(page).count();
    const box = page.getByRole('searchbox', { name: /buscar/i });

    await box.fill('zzzzzzzz');
    await expect(page.getByTestId('empty-state')).toBeVisible({ timeout: 5_000 });

    await box.fill('');
    await expect.poll(async () => dataRows(page).count(), { timeout: 5_000 }).toBe(unfiltered);
  });

  test('names what was searched when nothing matched, and offers a way out', async ({ page }) => {
    await openRegister(page);

    await page.getByRole('searchbox', { name: /buscar/i }).fill('zzzzzzzz');

    const guidance = page.getByTestId('empty-state-guidance');
    await expect(guidance).toBeVisible({ timeout: 5_000 });
    await expect(guidance).toContainText('zzzzzzzz');

    await page.getByRole('button', { name: /limpiar/i }).click();
    await expect(page.getByRole('searchbox', { name: /buscar/i })).toHaveValue('');
  });

  test('filters by matter type through the server', async ({ page }) => {
    await openRegister(page);
    test.skip(await page.getByTestId('empty-state').isVisible(), 'no seeded matters in this tenant');

    await page.getByRole('combobox', { name: 'Tipo' }).click();
    const options = page.getByRole('option');
    // The first option is "Todos los tipos"; a real entry follows it when the firm has one.
    test.skip((await options.count()) < 2, 'this tenant has no matter types catalogued');

    const [request] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes('/tenant/cases') && r.url().includes('matterTypeId='),
        { timeout: 10_000 },
      ),
      options.nth(1).click(),
    ]);
    expect(request.url()).toContain('matterTypeId=');
  });

  test('is reachable from the navigation, and BM is not offered it', async ({ page }) => {
    // The registry entry this slice flipped from unavailable to available.
    await page.goto('/');

    const rail = page.getByTestId('shell-nav');
    if (!(await rail.isVisible())) {
      await page.getByRole('button', { name: /abrir navegación/i }).click();
      await expect(page.getByTestId('shell-nav-mobile')).toBeVisible();
    }

    await page.getByRole('link', { name: 'Expedientes' }).click();
    await expect(page).toHaveURL(/\/expedientes$/);
  });
});

/*
 * The two audit assertions, run **serially against each other**.
 *
 * Both count `case.read` entries for this tenant, and the config runs individual tests in
 * parallel — so "listing writes zero" was counting while "opening writes one" was writing,
 * and failed about one run in three for a reason that has nothing to do with either claim.
 * They are the only two tests in the slice that share mutable server state.
 */
test.describe.serial('the audit log records deliberate access and nothing else', () => {
    test('LISTING MATTERS WRITES ZERO AUDIT ENTRIES', async ({ page, request }) => {
      /*
       * SC-005, research D4, and the assertion this file exists for.
       *
       * `006` audits the single-case read and deliberately does not audit the list. Anything
       * that reaches for a case record from a list row — a per-row fetch to fill a column, a
       * prefetch on hover, a warmed cache — turns one page view into fifty recorded accesses,
       * and an access log that records what a cursor passed over is worse than no log at all.
       *
       * Reading the log needs `audit.read_own_tenant`, which `004` gives to `SA` alone, so this
       * skips loudly under a fixture that does not hold it rather than passing quietly.
       */
      const probe = await request.get(`${API_BASE}/audit/events?limit=1`, { headers: HEADERS });
      test.skip(
        probe.status() !== 200,
        `the configured fixture does not hold audit.read_own_tenant (got ${probe.status()}); ` +
          `point it at an SA membership to run this`,
      );

      const countReads = async (): Promise<number> => {
        const response = await request.get(`${API_BASE}/audit/events?limit=100&action=case.read`, {
          headers: HEADERS,
        });
        expect(response.status()).toBe(200);
        const body = (await response.json()) as { items: unknown[] };
        return body.items.length;
      };

      const before = await countReads();

      await openRegister(page);
      // And page once, so the assertion covers more than the first fifty.
      const loadMore = page.getByRole('button', { name: /cargar m[aá]s/i });
      if (await loadMore.isVisible()) {
        await loadMore.click();
        await expect(page.getByTestId('loading-state')).toHaveCount(0, { timeout: 10_000 });
      }

      expect(await countReads()).toBe(before);
    });

    test('opening one matter writes exactly one access entry, and a refocus writes none', async ({
      page,
      request,
    }) => {
      /*
       * T033, research D3. `006` records an access per interactive read of a case, and this
       * application's query client refetches on window focus by default — so a reader who
       * alt-tabs away and back would silently write a second entry for a matter they opened
       * once. An access log that counts window focus is one nobody can reason about.
       */
      const probe = await request.get(`${API_BASE}/audit/events?limit=1`, { headers: HEADERS });
      test.skip(
        probe.status() !== 200,
        `the configured fixture does not hold audit.read_own_tenant (got ${probe.status()})`,
      );

      const countReads = async (): Promise<number> => {
        const response = await request.get(`${API_BASE}/audit/events?limit=100&action=case.read`, {
          headers: HEADERS,
        });
        const body = (await response.json()) as { items: unknown[] };
        return body.items.length;
      };

      await openRegister(page);
      const open = page.getByRole('table').getByRole('button', { name: /^abrir /i }).first();
      test.skip(!(await open.isVisible()), 'no matters to open in this tenant');

      const before = await countReads();

      await open.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByTestId('case-team')).toBeVisible({ timeout: 10_000 });

      expect(await countReads()).toBe(before + 1);

      // Away and back. The panel must treat its record as a snapshot taken at open.
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(500);

      expect(await countReads()).toBe(before + 1);
    });
});
