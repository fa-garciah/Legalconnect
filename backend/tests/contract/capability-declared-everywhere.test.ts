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
import { CAPABILITIES, capabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { CAPABILITY } from '../../src/common/authz/declare';
import { PLATFORM_SURFACE } from '../../src/common/permissions/guard';

@Module({ imports: [AppModule, DiscoveryModule] })
class DiscoveryWrapperModule {}

interface RouteHandler {
  readonly controller: string;
  readonly method: string;
  readonly capability: CapabilityId | undefined;
  readonly isPlatform: boolean;
}

/**
 * The registered capabilities with no route today (data-model.md rows 5, 8, 18-21,
 * plus 017's rows 22-24 — directory.module.ts is still an empty shell at this point
 * in 017's TDD sequence; its controllers land in later user-story tasks).
 */
const NO_ROUTE_YET: readonly CapabilityId[] = [
  'membership.read_tenant',
  'plan.read_own_tenant',
  'identity.read_registry',
  'identity.hard_delete',
  'membership.create_direct',
  'archetype.redefine',
  'directory.assign_position',
  'directory.manage_catalog',
  'directory.read',
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
        handlers.push({ controller: metatype.name, method: methodName, capability, isPlatform });
      }
    }
    return handlers;
  }

  it('0 routes carry no @Capability', () => {
    const undeclared = routeHandlers().filter((h) => !h.capability);
    expect(undeclared).toEqual([]);
  });

  it('the declared routes plus the registry rows with no endpoint account for all 24 capabilities', () => {
    const handlers = routeHandlers();
    const declaredIds = new Set(handlers.map((h) => h.capability));
    const allIds = new Set(Object.keys(CAPABILITIES) as CapabilityId[]);
    const undeclaredInRegistry = [...allIds].filter((id) => !declaredIds.has(id));

    expect(declaredIds.size + undeclaredInRegistry.length).toBe(24);
    expect(undeclaredInRegistry.sort()).toEqual([...NO_ROUTE_YET].sort());
  });

  it('T039: membership.read_tenant and plan.read_own_tenant are registered, decidable, and claimed by no route', () => {
    const handlers = routeHandlers();
    const declaredIds = new Set(handlers.map((h) => h.capability));

    for (const id of ['membership.read_tenant', 'plan.read_own_tenant'] as const) {
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
});
