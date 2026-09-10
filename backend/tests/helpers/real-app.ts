/**
 * The real production wiring (`AppModule`) with the real `DbMembershipPort` —
 * for contract tests that need actual seeded identity/membership/invitation
 * rows behind real HTTP requests, rather than the fixture-driven
 * `InMemoryMembershipPort` helpers 001 built for its own tests.
 *
 * ------------------------------------------------------------------------
 * 003/T055 — THIS FILE IS THE TEST-ONLY BOUNDARY FOR 002's HEADER STAND-INS.
 * ------------------------------------------------------------------------
 *
 * `002/research.md` D10 shipped `x-identity-id`, `x-subject` and `x-email` as
 * deliberate stand-ins, on the explicit condition that "real verification does not
 * exist until slice 003" — which is also why every 002 surface stayed bound to
 * loopback. Slice 003 supplied that verification, and FR-041/SC-030 now require
 * the stand-ins to be accepted on ZERO network-reachable surfaces.
 *
 * They still have to exist SOMEWHERE, because a contract test for membership
 * revocation should not have to conduct a full sign-in ceremony to reach the route
 * it is testing. So they live here, in a file `AppModule` does not import and
 * production never loads.
 *
 * The mechanism matters as much as the location. This middleware sets a PROPERTY
 * on the request object, which no HTTP client can reach — headers, query and body
 * all land elsewhere. Production installs no equivalent, so there is no
 * configuration, flag or header that turns this on in a deployed environment. It
 * is absent rather than disabled, which is the same standard FR-007 sets for
 * anything that would weaken authentication.
 *
 * `createRealApp()` is the ordinary helper. `createRealApp()` keeps its
 * original meaning — no stand-in at all — for the tests that must prove a route
 * refuses an unauthenticated caller.
 */
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

interface StandInRequest {
  headers: Record<string, string | string[] | undefined>;
  identityId?: string;
}

function firstHeader(headers: StandInRequest['headers'], name: string): string | undefined {
  const raw = headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Installs 002's `x-identity-id` stand-in on any app.
 *
 * Exported because several suites (001's interceptor mechanics, 004's refusal
 * shapes) build their own minimal module rather than booting `AppModule`, and they
 * need the same boundary. Keeping ONE implementation of the stand-in is the point:
 * a second copy somewhere else is how it would eventually reach production code.
 */
export function installIdentityStandIn(app: {
  use(fn: (req: StandInRequest, res: unknown, next: () => void) => void): unknown;
}): void {
  app.use((req: StandInRequest, _res: unknown, next: () => void) => {
    const standIn = firstHeader(req.headers, 'x-identity-id');
    if (standIn) req.identityId = standIn;
    next();
  });
}

/** No stand-in. A request without a real session is refused, as in production. */
export async function createUnauthenticatedApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  return app;
}

/**
 * With the stand-in installed. `x-identity-id` is read exactly once, here, and
 * becomes the request's established identity — the same thing `SessionGuard` would
 * have produced from a real token.
 */
export async function createAuthenticatedApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });

  installIdentityStandIn(app);
  await app.init();
  return app;
}
