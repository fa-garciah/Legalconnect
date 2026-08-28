/**
 * T023 — the single global decision point (research.md D2). Registered in
 * `app.module.ts` after both context interceptors and before `AuditInterceptor`, so it
 * runs for every route on every surface — tenant, platform and identity alike — and
 * reads whichever principal that surface's own interceptor has already resolved.
 *
 * FR-019: a route with no `@Capability()` is unreachable, so the very first thing this
 * does is check for the declaration and refuse — via the same generic 404
 * `ResourceNotFound` every other tenant-existence refusal uses — before `decide()` is
 * ever called.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import { capabilityDef, type CapabilityId } from './capability';
import { CAPABILITY, SCOPE_TARGET } from './declare';
import { decide } from './decide';
import { refusalToHttp } from './refusal';
import type { ScopeRequest } from './scope';
import type { Subject } from './matrix';
import { ResourceNotFound } from '../http/errors';
import { firstHeaderValue } from '../http/header';
import { IDENTITY_SURFACE, PLATFORM_SURFACE } from '../permissions/guard';
import { currentPrincipal } from '../tenant/middleware';
import type { ActivePrincipal } from '../tenant/principal';

interface IncomingRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly params?: Record<string, string | undefined>;
}

interface Caller {
  readonly subject: Subject;
  readonly principal: ActivePrincipal | null;
  readonly identityId: string | null;
}

@Injectable()
export class AuthorizationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.decideAndProceed(context, next));
  }

  private async decideAndProceed(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const capabilityId = this.reflector.getAllAndOverride<CapabilityId | undefined>(CAPABILITY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!capabilityId) throw new ResourceNotFound();

    const def = capabilityDef(capabilityId);
    const isPlatform = Boolean(
      this.reflector.getAllAndOverride<boolean>(PLATFORM_SURFACE, [context.getHandler(), context.getClass()]),
    );
    const isIdentityOnly = Boolean(
      this.reflector.getAllAndOverride<boolean>(IDENTITY_SURFACE, [context.getHandler(), context.getClass()]),
    );

    // Two markers must never coexist on a tenant-scoped capability — that is what
    // makes `PO` provably unable to reach a tenant-scoped row (FR-008, SC-003). This
    // is asserted for real by capability-declared-everywhere.test.ts; the throw here
    // is a second, load-bearing line of defence rather than a redundant check.
    if ((isPlatform || isIdentityOnly) && def.scope === 'tenant') {
      throw new Error(
        `${capabilityId} is declared 'tenant' scope but exposed on a platform/identity route`,
      );
    }

    const request = context.switchToHttp().getRequest<IncomingRequest>();
    const caller = this.resolveCaller(request, isPlatform, isIdentityOnly);

    const scope: ScopeRequest = {
      subject: caller.subject,
      capability: capabilityId,
      principal: caller.principal,
      identityId: caller.identityId,
      // No route in this registry names a target tenant independent of the caller's
      // own active one — RLS already confines every tenant-scoped read/write to it.
      // A future capability resolving `tenant` scope against an entity that carries
      // its own tenant id would populate this from that entity instead.
      targetTenantId: caller.principal?.tenantId ?? null,
      // The id of the entity a scope resolver must decide about, read from the route's
      // own `@ScopeTarget` declaration.
      //
      // This was `null` unconditionally until 006-client-case-core (its FR-013,
      // research.md D2), and that was correct for as long as it lasted: 004's two
      // `self`-scoped routes name no target — accepting an invitation has no prior
      // identity to compare against, and reading one's own memberships takes no id
      // parameter at all (research.md D8) — and `tenant` scope is decided from the
      // principal alone. 017 added three more `tenant` rows and did not change that.
      //
      // The first `assigned`-scoped capability is what ends it: a resolver cannot answer
      // "are you on THIS case" without being told which case. A route that declares
      // `assigned` scope and no `@ScopeTarget` fails the build
      // (tests/contract/scope-target-declared.test.ts), because at runtime it would look
      // identical to a correct refusal — `undefined` here makes the resolver fail closed,
      // and FR-016 makes that byte-identical to a nonexistent resource.
      targetId: this.scopeTargetOf(context, request),
    };

    const decision = await decide({
      subject: caller.subject,
      capability: capabilityId,
      // Not applicable here: `resolvePrincipal` already refused an unenrolled
      // identity before this interceptor ever runs (contracts/refusal.md §1).
      mfaEnrolledAt: undefined,
      scope,
      plan: caller.principal?.plan ?? null,
    });

    if (!decision.permitted) {
      throw refusalToHttp(decision, def.scope);
    }

    return firstValueFrom(next.handle() as Observable<unknown>);
  }

  /**
   * The scoped entity's id, per 006's `@ScopeTarget` declaration.
   *
   * Returns `null` when the route declares no target — every `tenant`, `self` and `none`
   * capability, which is 32 of the 35 rows — and `null` again when it declares one that
   * the request does not carry. The second case is unreachable through Nest's router
   * (a declared `:caseId` is always present on a matched route) and is handled anyway
   * rather than coerced: `null` makes the resolver fail closed, which is the safe
   * direction, and `String(undefined)` would hand it the literal text "undefined" to
   * compare against a uuid.
   */
  private scopeTargetOf(context: ExecutionContext, request: IncomingRequest): string | null {
    const paramName = this.reflector.getAllAndOverride<string | undefined>(SCOPE_TARGET, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!paramName) return null;
    return request.params?.[paramName] ?? null;
  }

  /**
   * Derives the subject per surface (research.md D2, D8, D9). `PO` comes from the
   * route's own `@PlatformSurface()` declaration, never from a claim; the identity
   * surface has no membership at all, so `subject` there is inert — every capability
   * exposed on that surface resolves at `self` scope, which never consults it.
   */
  private resolveCaller(request: IncomingRequest, isPlatform: boolean, isIdentityOnly: boolean): Caller {
    if (isPlatform) {
      return { subject: 'PO', principal: null, identityId: null };
    }
    if (isIdentityOnly) {
      const identityId = firstHeaderValue(request.headers, 'x-identity-id') ?? null;
      return { subject: 'SA', principal: null, identityId };
    }
    const principal = currentPrincipal();
    return { subject: principal.archetype, principal, identityId: principal.identityId };
  }
}
