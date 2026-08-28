/**
 * T016 — 006/FR-013, research.md D2. The build gate for the `targetId` seam.
 *
 * Walks the real Nest router via `DiscoveryService`, the same way
 * `capability-declared-everywhere.test.ts` does for `@Capability`, and asserts that every
 * route whose capability resolves at `assigned` scope also declares `@ScopeTarget`.
 *
 * **Why this test has to exist.** `AuthorizationInterceptor` populates
 * `ScopeRequest.targetId` from the `@ScopeTarget` declaration. A route that declares
 * `assigned` scope and forgets it leaves `targetId` as `undefined`, the resolver fails
 * closed, and the caller sees a 404 — which is *exactly* what a correct scope refusal
 * looks like (FR-016 makes them byte-identical on purpose). The bug therefore hides behind
 * a plausible refusal until someone reports "I cannot open my own case." Nothing at
 * runtime can distinguish the two, so the check belongs here, at build time.
 *
 * A separate file from `capability-declared-everywhere.test.ts` rather than an extension
 * of it: that file is 004's, this rule is 006's, and keeping them apart means this slice
 * modifies no test file another slice owns (006/SC-014).
 */
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, NestFactory, Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../../src/app.module';
import { capabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { CAPABILITY, SCOPE_TARGET } from '../../src/common/authz/declare';

@Module({ imports: [AppModule, DiscoveryModule] })
class DiscoveryWrapperModule {}

interface RouteHandler {
  readonly controller: string;
  readonly method: string;
  readonly capability: CapabilityId | undefined;
  readonly scopeTarget: string | undefined;
}

describe('scope target declared on every assigned-scope route', () => {
  let app: INestApplication;
  let discovery: DiscoveryService;
  let reflector: Reflector;

  beforeAll(async () => {
    app = await NestFactory.create(DiscoveryWrapperModule, { logger: false });
    discovery = app.get(DiscoveryService);
    reflector = app.get(Reflector);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function routeHandlers(): readonly RouteHandler[] {
    const handlers: RouteHandler[] = [];
    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      const metatype = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
      if (!instance || !metatype) continue;

      const prototype = Object.getPrototypeOf(instance) as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === 'constructor') continue;
        const handler = prototype[methodName];
        if (!handler) continue;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;

        handlers.push({
          controller: metatype.name,
          method: methodName,
          capability: reflector.getAllAndOverride<CapabilityId | undefined>(CAPABILITY, [
            handler,
            metatype,
          ]),
          scopeTarget: reflector.getAllAndOverride<string | undefined>(SCOPE_TARGET, [
            handler,
            metatype,
          ]),
        });
      }
    }
    return handlers;
  }

  const assignedRoutes = (): readonly RouteHandler[] =>
    routeHandlers().filter((h) => h.capability && capabilityDef(h.capability).scope === 'assigned');

  it('0 assigned-scope routes are missing @ScopeTarget', () => {
    const missing = assignedRoutes()
      .filter((h) => !h.scopeTarget)
      .map((h) => `${h.controller}.${h.method} (${h.capability ?? 'none'})`);

    expect(missing).toEqual([]);
  });

  it('at least one route resolves at assigned scope', () => {
    // Guards against the failure mode where the assertion above passes vacuously because
    // nothing resolves at `assigned` — which was the state of the entire codebase before
    // this slice, and is the state 004 shipped in deliberately (004/research.md D6).
    expect(assignedRoutes().length).toBeGreaterThan(0);
  });

  it('0 routes declare @ScopeTarget without needing it', () => {
    // The reverse direction. A `@ScopeTarget` on a `tenant`-scoped route is inert, and an
    // inert declaration reads to a later maintainer as though scope were being enforced
    // where it is not. `case.read_list` is the row this most plausibly happens to, since
    // it is `tenant`-scoped for a subtle reason (FR-014, research.md D3).
    const pointless = routeHandlers()
      .filter((h) => h.scopeTarget && h.capability && capabilityDef(h.capability).scope !== 'assigned')
      .map((h) => `${h.controller}.${h.method} (${h.capability ?? 'none'})`);

    expect(pointless).toEqual([]);
  });
});
