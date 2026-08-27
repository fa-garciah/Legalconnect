/**
 * T045 — US5, SC-006, SC-012. Loading, error and empty are visually distinguishable
 * from one another for the same region. Deferred to the Polish e2e pass (T052), once
 * a real screen exists to drive the three states through.
 */
import { test } from '@playwright/test';

test.describe('loading, error and empty are visually distinguishable', () => {
  test.skip(true, 'needs a real tenant-scoped screen to exercise — wired once one exists');

  test('the three states render distinct DOM structures for the same region', async () => {
    // Intentionally empty — proven at the component tier today (QueryBoundary.test.tsx
    // already asserts mutual exclusivity, FR-019/SC-012's core guarantee); this e2e
    // scenario adds the visual/screenshot confirmation once a real screen exists.
  });
});
