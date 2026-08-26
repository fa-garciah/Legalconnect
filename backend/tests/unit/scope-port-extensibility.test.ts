/**
 * T055 — a downstream slice registers its `assigned` resolver from its OWN module,
 * through Nest DI, without editing any file under `backend/src/common/authz/`
 * (FR-015, research.md D3). `decide()` picks it up because the registry
 * `registerScopeResolver` writes into is a plain module-scoped store, read by
 * `resolverFor` regardless of how the entry got there.
 *
 * `SCOPE_RESOLVERS` is the documented extension seam (contracts/refusal.md §6): the
 * resolver is an ordinary `@Injectable()`, constructed by Nest with its own
 * dependencies, that self-registers from `onModuleInit`. This is what lets it use
 * Nest DI for whatever it needs (a repository, in a real slice) — a plain exported
 * function could not.
 */
import 'reflect-metadata';
import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { decide } from '../../src/common/authz/decide';
import { CAPABILITIES, type CapabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { MATRIX } from '../../src/common/authz/matrix';
import { registerScopeResolver, unregisterScopeResolver, type ScopeResolver } from '../../src/common/authz/scope';

const ASSIGNED_ID = 'test.extensibility_probe' as CapabilityId;

/**
 * A downstream slice's own resolver — no file under `common/authz/` is imported for
 * writing, only for the port's own types.
 */
@Injectable()
class FixtureAssignedResolver implements ScopeResolver, OnModuleInit {
  readonly kind = 'assigned' as const;

  onModuleInit(): void {
    registerScopeResolver(this);
  }

  async resolve(): Promise<boolean> {
    return true;
  }
}

@Module({ providers: [FixtureAssignedResolver] })
class DownstreamFixtureModule {}

describe('scope port extensibility — a downstream module registers assigned', () => {
  afterEach(() => {
    unregisterScopeResolver('assigned');
    delete (CAPABILITIES as Record<string, CapabilityDef>)[ASSIGNED_ID];
    delete (MATRIX as unknown as Record<string, Set<string>>)[ASSIGNED_ID];
  });

  it("decide() picks up the resolver once the fixture module's onModuleInit has run", async () => {
    (CAPABILITIES as Record<string, CapabilityDef>)[ASSIGNED_ID] = { scope: 'assigned' };
    (MATRIX as unknown as Record<string, Set<string>>)[ASSIGNED_ID] = new Set(['AA']);

    const app: INestApplication = await NestFactory.create(DownstreamFixtureModule, { logger: false });
    await app.init(); // runs onModuleInit for every provider, including FixtureAssignedResolver

    const decision = await decide({
      subject: 'AA',
      capability: ASSIGNED_ID,
      mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
      scope: {
        subject: 'AA',
        capability: ASSIGNED_ID,
        principal: { identityId: 'i', membershipId: 'm', tenantId: 't', archetype: 'AA' },
        identityId: 'i',
        targetTenantId: 't',
        targetId: 'case-1',
      },
      plan: null,
    });

    expect(decision.permitted).toBe(true);
    await app.close();
  });
});
