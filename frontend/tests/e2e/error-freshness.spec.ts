/**
 * T040 — US4, spec.md User Story 4 scenario 9. An errored region issues a fresh
 * request when the person navigates away and back, rather than redisplaying the
 * stale error. Deferred to the Polish e2e pass (T052) — needs a real screen backed
 * by a failing/recovering endpoint, which does not exist until a domain slice ships.
 */
import { test } from '@playwright/test';

test.describe('error freshness', () => {
  test.skip(true, 'needs a real tenant-scoped screen to exercise — wired once one exists');

  test('navigating away and back re-attempts the request fresh', async () => {
    // Intentionally empty until a domain slice supplies a screen to drive this
    // through. The mechanism itself (fresh query per mount) is proven by
    // QueryBoundary's own TanStack Query cache semantics — T043.
  });
});
