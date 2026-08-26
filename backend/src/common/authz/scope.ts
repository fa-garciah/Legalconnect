/**
 * T012 — `ScopeResolverPort`: keyed by scope KIND, not by capability (research.md D3).
 *
 * Fail-closed by construction: `resolverFor` returns `undefined` for a kind nobody
 * registered, and `decide()` treats that as a refusal, never a default permit. That is
 * what lets `assigned` be declared today, with no resolver, without opening anything
 * (US5 scenario 6).
 *
 * The registry is a plain module-scoped map, not NestJS DI, so the three resolvers
 * below — and `resolverFor` itself — are callable with no framework and no container
 * (T011's unit test exercises them directly). `SCOPE_RESOLVERS` exists as the
 * documented extension seam (contracts/refusal.md §6): a downstream slice's own module
 * constructs its resolver through Nest DI (for its own dependencies) and calls
 * `registerScopeResolver(this)` from `onModuleInit` — no file here is edited to do it.
 */
import type { ActivePrincipal } from '../tenant/principal';
import type { CapabilityId, ScopeKind } from './capability';
import type { Subject } from './matrix';

export interface ScopeRequest {
  readonly subject: Subject;
  readonly capability: CapabilityId;
  readonly principal: ActivePrincipal | null;
  readonly identityId: string | null;
  readonly targetTenantId: string | null;
  readonly targetId: string | null;
}

export interface ScopeResolver {
  readonly kind: ScopeKind;
  resolve(request: ScopeRequest): Promise<boolean>;
}

/** The DI extension seam a downstream slice's resolver provider is registered under. */
export const SCOPE_RESOLVERS = Symbol('SCOPE_RESOLVERS');

const registry = new Map<ScopeKind, ScopeResolver>();

export function registerScopeResolver(resolver: ScopeResolver): void {
  registry.set(resolver.kind, resolver);
}

/** Fails closed: an unregistered kind — `assigned`, today — returns `undefined`. */
export function resolverFor(kind: ScopeKind): ScopeResolver | undefined {
  return registry.get(kind);
}

/**
 * Test-only escape hatch: removes a kind's resolver so `decide()`'s fail-closed
 * branch can be exercised against a real, otherwise-permitted capability rather than
 * a synthetic one (deny-by-default.test.ts). Returns the resolver removed, so a test
 * can restore it afterward.
 */
export function unregisterScopeResolver(kind: ScopeKind): ScopeResolver | undefined {
  const previous = registry.get(kind);
  registry.delete(kind);
  return previous;
}

/**
 * True inside the caller's own tenant, false otherwise. `targetTenantId` is `null`
 * only for a capability that names no specific tenant target, which never happens for
 * a `tenant`-scoped capability in this registry — so `false` there is the safe,
 * fail-closed answer rather than a case that should be unreachable.
 */
class TenantScopeResolver implements ScopeResolver {
  readonly kind: ScopeKind = 'tenant';

  async resolve(request: ScopeRequest): Promise<boolean> {
    if (!request.principal || !request.targetTenantId) return false;
    return request.principal.tenantId === request.targetTenantId;
  }
}

/**
 * True when no specific target is named — the operation is inherently the caller's
 * own (rows 9-10: accepting an invitation names no prior identity to compare against,
 * and reading one's own memberships names no id parameter at all) — or, when a target
 * IS named, only when it equals the caller's own identity. A named target with no
 * known caller identity fails closed.
 */
class SelfScopeResolver implements ScopeResolver {
  readonly kind: ScopeKind = 'self';

  async resolve(request: ScopeRequest): Promise<boolean> {
    if (request.targetId === null) return true;
    if (!request.identityId) return false;
    return request.identityId === request.targetId;
  }
}

/** No entity to check against — always true. */
class NoneScopeResolver implements ScopeResolver {
  readonly kind: ScopeKind = 'none';

  async resolve(_request: ScopeRequest): Promise<boolean> {
    return true;
  }
}

export const tenantScopeResolver = new TenantScopeResolver();
export const selfScopeResolver = new SelfScopeResolver();
export const noneScopeResolver = new NoneScopeResolver();

registerScopeResolver(tenantScopeResolver);
registerScopeResolver(selfScopeResolver);
registerScopeResolver(noneScopeResolver);
