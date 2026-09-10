/**
 * Enumerates the registered HTTP routes of a Nest app.
 *
 * WHY THIS EXISTS AS A HELPER. Three suites assert things about the ABSENCE of
 * routes — no route returns a factor secret, none returns the backup codes,
 * none is ungated without saying so. Every one of those is a `for (path of
 * paths) expect(...).not.toMatch(...)` loop, which passes PERFECTLY when
 * `paths` is empty.
 *
 * And it was empty. Express 5 renamed `app._router` to `app.router`, so the
 * original accessor returned undefined and two of those suites were green
 * against nothing at all. The bug was caught by a single non-vacuity assertion
 * in the third — which is why `expectRoutes()` below refuses to return an empty
 * list rather than leaving that check to each caller's discipline.
 */
import type { INestApplication } from '@nestjs/common';

export interface RegisteredRoute {
  readonly path: string;
  readonly methods: readonly string[];
}

interface ExpressLayer {
  route?: { path?: string; methods?: Record<string, boolean> };
}

interface ExpressLike {
  /** Express 5. */
  router?: { stack?: ExpressLayer[] };
  /** Express 4, kept so this helper survives either. */
  _router?: { stack?: ExpressLayer[] };
}

export function registeredRoutes(app: INestApplication): RegisteredRoute[] {
  const instance = app.getHttpAdapter().getInstance() as ExpressLike;
  const stack = instance.router?.stack ?? instance._router?.stack ?? [];

  return stack
    .filter((layer): layer is ExpressLayer & { route: { path: string } } =>
      typeof layer.route?.path === 'string',
    )
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.entries(layer.route.methods ?? {})
        .filter(([, enabled]) => enabled)
        .map(([method]) => method.toLowerCase()),
    }));
}

/**
 * The same, but THROWS on an empty result.
 *
 * Use this in any test whose assertion is about routes NOT existing. An absence
 * proven against an empty list is not proven at all, and this makes that
 * failure loud instead of green.
 */
export function expectRoutes(app: INestApplication): RegisteredRoute[] {
  const routes = registeredRoutes(app);
  if (routes.length === 0) {
    throw new Error(
      'No routes were enumerated. The adapter internals have changed again — see ' +
        'tests/helpers/routes.ts. Every absence assertion built on this would be vacuous.',
    );
  }
  return routes;
}
