/**
 * T048 — SC-014, FR-027. A principal lacking the archetype for a navigation item does
 * not see it rendered; a direct call to that item's underlying API route is refused by
 * 004's decision function identically to an unhidden item. Deferred to the Polish e2e
 * pass once a real navigation item references a real 004 capability — the registry
 * (`navigation-items.ts`) and the matrix mirror (`capability-matrix.ts`) both start
 * empty in this slice (research.md D1, data-model.md), so there is no real item to
 * hide yet. The cosmetic-only guarantee itself is structural: this shell's filter
 * (`filterNavigationItems`) never touches the network, so it cannot have made an
 * item MORE reachable, and 004's own AuthorizationInterceptor is untouched by
 * anything in `frontend/`.
 */
import { test } from '@playwright/test';

test.describe('hiding a navigation item is cosmetic only', () => {
  test.skip(true, 'needs a real navigation item backed by a real 004 capability — wired by the first domain slice');

  test('the underlying route refuses identically whether or not the item was hidden', async () => {
    // Intentionally empty until a domain slice adds its first navigation item.
  });
});
