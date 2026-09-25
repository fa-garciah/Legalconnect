/**
 * T020 — every route in the real router declares exactly one capability, on every
 * surface. SC-013, FR-008. Walks the actual Nest router via `DiscoveryService` rather
 * than a hand-maintained route list, for the same reason the exhaustive matrix suite
 * iterates `Object.keys(CAPABILITIES)` instead of one (FR-018's spirit, applied to
 * routes rather than capabilities).
 */
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, NestFactory, Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../../src/app.module';
import { CAPABILITIES, STEP_UP_CAPABILITIES, capabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { CAPABILITY } from '../../src/common/authz/declare';
import { AUTH_SURFACE, PLATFORM_SURFACE } from '../../src/common/permissions/guard';

@Module({ imports: [AppModule, DiscoveryModule] })
class DiscoveryWrapperModule {}

interface RouteHandler {
  readonly controller: string;
  readonly method: string;
  readonly capability: CapabilityId | undefined;
  readonly isPlatform: boolean;
  /** 003/FR-040 — declares this route as part of the authentication surface. */
  readonly isAuthSurface: boolean;
}

/**
 * The registered capabilities with no route today (data-model.md rows 5, 8, 18-21).
 * 017's rows 22-24 are NOT here: each gained its route as its user story landed
 * (T017, T023, T026), which is what this list existing at all is meant to make
 * visible.
 */
const NO_ROUTE_YET: readonly CapabilityId[] = [
  // `membership.read_tenant` (row 5) left this list in 014: `GET /tenant/members`.
  'plan.read_own_tenant',
  'identity.read_registry',
  'identity.hard_delete',
  'membership.create_direct',
  'archetype.redefine',
];

describe('capability declared everywhere', () => {
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

      const prototype = Object.getPrototypeOf(instance) as Record<string, (...args: unknown[]) => unknown>;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === 'constructor') continue;
        const handler = prototype[methodName];
        if (!handler) continue;
        // Only actual HTTP route handlers carry Nest's path metadata — this excludes
        // any plain helper method a controller might carry on its prototype.
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;

        const capability = reflector.getAllAndOverride<CapabilityId | undefined>(CAPABILITY, [
          handler,
          metatype,
        ]);
        const isPlatform = Boolean(
          reflector.getAllAndOverride<boolean>(PLATFORM_SURFACE, [handler, metatype]),
        );
        const isAuthSurface = Boolean(
          reflector.getAllAndOverride<boolean>(AUTH_SURFACE, [handler, metatype]),
        );
        handlers.push({ controller: metatype.name, method: methodName, capability, isPlatform, isAuthSurface });
      }
    }
    return handlers;
  }

  it('0 routes carry no @Capability, except the declared authentication surface', () => {
    // 003/FR-040. The four `/auth/*` routes carry no capability BY DESIGN: they
    // run before an authenticated, membership-resolved principal exists, so
    // there is no archetype to check against, no tenant to scope to and no plan
    // to consult. contracts/README.md states this positively so an audit does
    // not file it as a missing-authorization defect.
    //
    // The exemption is keyed on the ROUTE'S OWN @AuthSurface() marker, not on a
    // controller name or a path prefix. A future route that forgets the
    // capability still fails here; one that means to be ungated has to say so
    // where a reviewer reads it.
    const undeclared = routeHandlers().filter((h) => !h.capability && !h.isAuthSurface);
    expect(undeclared).toEqual([]);
  });

  it('every ungated route is on the authentication surface and nowhere else', () => {
    // The other direction: @AuthSurface() must not spread. If a tenant-facing
    // controller ever acquires it, this names the offender.
    //
    // The allow-list is ENUMERATED rather than matched on a name pattern. A
    // pattern like /Auth.*Controller/ would silently admit whatever somebody
    // named that way next; a list makes each addition a line in a diff a
    // reviewer reads. Both entries here are ungated for the same reason —
    // each runs before an authenticated principal exists, which is the state
    // they exist to end (FR-040, contracts/README.md).
    const AUTHENTICATION_CONTROLLERS = [
      'SignInController',
      'EnrollmentController',
      'RecoveryController',
      // 005-session-lifecycle. Both resolve their own presented token rather than
      // relying on SessionGuard/AuthorizationInterceptor's ordinary path — see
      // sign-out.controller.ts / step-up.controller.ts and research.md D4.
      'SignOutController',
      'StepUpController',
    ];

    const ungated = routeHandlers().filter((h) => !h.capability);
    for (const handler of ungated) {
      expect(handler.isAuthSurface, `${handler.controller}.${handler.method}`).toBe(true);
      expect(AUTHENTICATION_CONTROLLERS, `${handler.controller} is ungated`).toContain(
        handler.controller,
      );
    }
  });

  it('the declared routes plus the registry rows with no endpoint account for all 46 capabilities', () => {
    const handlers = routeHandlers();
    // Filtered, because the authentication surface contributes `undefined` —
    // counting it would inflate the census by one for a route that declares no
    // capability on purpose (003/FR-040).
    const declaredIds = new Set(
      handlers.map((h) => h.capability).filter((id): id is CapabilityId => id !== undefined),
    );
    const allIds = new Set(Object.keys(CAPABILITIES) as CapabilityId[]);
    const undeclaredInRegistry = [...allIds].filter((id) => !declaredIds.has(id));

    // 21 (004) + 3 (017) + 11 (006) + 8 (007). This number is a census, not an assertion
    // about any one slice, so every slice that extends the registry moves it — 017 took
    // it from 21 to 24, 006 took it to 35, 007 took it to 43, and 013 takes it to 45.
    // 023 takes it to 46 with `document.read_list`, which DOES have a route — so the
    // `NO_ROUTE_YET` list asserted below is unchanged.
    expect(declaredIds.size + undeclaredInRegistry.length).toBe(46);
    expect(undeclaredInRegistry.sort()).toEqual([...NO_ROUTE_YET].sort());
  });

  // 014 gave `membership.read_tenant` its route (`GET /tenant/members`, Decision 5), so only
  // `plan.read_own_tenant` is still inert; the other half now asserts the route exists.
  it('T039: plan.read_own_tenant is registered, decidable, and claimed by no route; membership.read_tenant now has one', () => {
    const handlers = routeHandlers();
    const declaredIds = new Set(handlers.map((h) => h.capability));

    expect(declaredIds.has('membership.read_tenant')).toBe(true);
    for (const id of ['plan.read_own_tenant'] as const) {
      expect(CAPABILITIES[id]).toBeDefined();
      expect(capabilityDef(id).scope).toBe('tenant');
      expect(declaredIds.has(id)).toBe(false);
    }
  });

  it('0 routes carry both @PlatformSurface() and a tenant-scoped capability', () => {
    const violations = routeHandlers().filter(
      (h) => h.isPlatform && h.capability && capabilityDef(h.capability).scope === 'tenant',
    );
    expect(violations).toEqual([]);
  });

  it('005-session-lifecycle, research.md D9: exactly 1 stepUp capability is platform-surfaced, and it is invitation.issue_seed', () => {
    // `AuthorizationInterceptor`'s step-up gate skips any caller with no
    // `identityId` — structurally, only the platform surface (`PO`) has none.
    // That skip is deliberately narrow, not a general "no caller, no step-up"
    // escape hatch: this assertion is what keeps it narrow. If a future
    // `stepUp: true` capability is ever declared on `@PlatformSurface()`, it
    // silently inherits the same identity-less exemption unless someone
    // consciously revisits research.md D9 first — this test is what forces
    // that revisit rather than the exemption spreading unnoticed.
    const platformStepUp = routeHandlers().filter(
      (h) => h.isPlatform && h.capability && STEP_UP_CAPABILITIES.has(h.capability),
    );
    expect(platformStepUp.map((h) => h.capability)).toEqual(['invitation.issue_seed']);

    // The other direction: every OTHER stepUp capability's route requires a
    // real identity — none is reachable from the platform surface, and none is
    // ungated (auth-surface). A step-up gate that silently no-ops for any of
    // these would be the "identity-less callers slip through" failure this
    // slice's implementation report was careful to rule out.
    const otherStepUp = routeHandlers().filter(
      (h) => h.capability && STEP_UP_CAPABILITIES.has(h.capability) && h.capability !== 'invitation.issue_seed',
    );
    for (const handler of otherStepUp) {
      expect(handler.isPlatform, `${handler.controller}.${handler.method}`).toBe(false);
      expect(handler.isAuthSurface, `${handler.controller}.${handler.method}`).toBe(false);
    }
    expect(otherStepUp.length).toBe(STEP_UP_CAPABILITIES.size - 1);
  });
});
