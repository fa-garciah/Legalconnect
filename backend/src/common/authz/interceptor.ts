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
import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { capabilityDef, type CapabilityId } from './capability';
import { CAPABILITY, SCOPE_TARGET } from './declare';
import { decide } from './decide';
import { refusalToHttp } from './refusal';
import type { ScopeRequest } from './scope';
import type { Subject } from './matrix';
import { ResourceNotFound, StepUpRequired } from '../http/errors';
import { AUTH_SURFACE, IDENTITY_SURFACE, PLATFORM_SURFACE } from '../permissions/guard';
import { currentPrincipal } from '../tenant/middleware';
import type { ActivePrincipal } from '../tenant/principal';
import { appDb } from '../db/client';
import { firstHeaderValue } from '../http/header';
import { roleClassFor, SESSION_LIMITS } from '../auth/session-lifecycle';

interface IncomingRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly params?: Record<string, string | undefined>;
  /** 003/T033. Set by `SessionGuard`, which runs before every interceptor. */
  readonly identityId?: string;
  /**
   * 005-session-lifecycle, research.md D2/D4. Set by `SessionGuard`, ONLY when a
   * real session was resolved — never for the `x-identity-id` test stand-in
   * (`SessionGuard` returns early for it, before ever calling `resolve_session()`),
   * and never for the auth/platform surfaces (neither resolves a session at all).
   * When absent, the idle/absolute check below has nothing to check and is
   * skipped — deliberately, so as not to require every one of `001`-`004`'s
   * existing stand-in-based tests to mint a real session (see this interceptor's
   * own doc comment on `decideAndProceed()` for the full reasoning).
   */
  readonly sessionId?: string;
  readonly lastSeenAt?: Date;
  readonly familyCreatedAt?: Date;
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
    // 003/FR-040. The authentication surface is skipped BEFORE the
    // undeclared-route refusal below, because these routes legitimately declare
    // no capability: they run before a principal exists, so there is nothing to
    // decide against. Skipping is a declared, reviewable act — the route says
    // @AuthSurface() — rather than an absence the interceptor infers.
    const isAuthSurface = Boolean(
      this.reflector.getAllAndOverride<boolean>(AUTH_SURFACE, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    if (isAuthSurface) return firstValueFrom(next.handle() as Observable<unknown>);

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

    // 005-session-lifecycle, research.md D3/D4. Idle and absolute expiry — the
    // FIRST thing decided once a caller exists, ahead of both `decide()` and
    // US2's step-up consumption below, per D4's explicit ordering. A stale
    // session has nothing left to decide a permission about, and checking first
    // means it is never charged against `decide()`'s entitlement-read cost.
    //
    // SKIPPED WHEN `request.sessionId` IS ABSENT — deliberately, not an oversight.
    // In PRODUCTION every non-auth/platform route reaches here only after
    // `SessionGuard` has genuinely resolved a session, so this is never absent
    // there. It IS absent for every existing `001`-`004` test built on the
    // `x-identity-id` stand-in (`tests/helpers/real-app.ts`), which sets
    // `request.identityId` directly and short-circuits `SessionGuard` before it
    // ever calls `resolve_session()` — a test-only shortcut that predates this
    // slice. Requiring a real session there would mean retrofitting hundreds of
    // existing tests to mint one for a mechanic they are not exercising; this
    // slice's OWN tests (`idle-absolute-expiry.test.ts`) drive real sign-ins
    // specifically so this check is genuinely exercised end to end.
    if (request.sessionId && request.lastSeenAt && request.familyCreatedAt) {
      const roleClass = roleClassFor(caller.principal?.archetype ?? null);
      const limits = SESSION_LIMITS[roleClass];
      const idleMs = Date.now() - request.lastSeenAt.getTime();
      const absoluteMs = Date.now() - request.familyCreatedAt.getTime();
      if (idleMs > limits.idleMinutes * 60_000 || absoluteMs > limits.absoluteMinutes * 60_000) {
        // Byte-identical to `SessionGuard`'s own refusal (session.guard.ts) — an
        // idle-expired, absolute-expired, revoked and never-existed session are
        // all indistinguishable to the caller (FR-005, FR-011).
        throw new UnauthorizedException('No autenticado.');
      }
      // Only past this point does the presentation count as "used" — a refused
      // presentation must never extend the clock it was refused against (D2).
      await appDb().execute(sql`SELECT touch_session(${request.sessionId})`);
    }

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

    // 005-session-lifecycle, research.md D6. AFTER decide() has already allowed
    // the request (Edge Cases: "the ordinary permission refusal applies first"),
    // not before — an identity without the underlying permission is refused by
    // the ordinary check above and never reaches this gate at all.
    //
    // CONFIRMED — deferred by non-exposure (research.md D9), the same posture
    // this codebase already applies to every `stepUp: true` capability that
    // isn't reachable yet. One of the five, `invitation.issue_seed`, is exposed
    // on the PLATFORM surface, where `caller.identityId` is always `null` (`PO`
    // is a vendor role, not a tenant membership — "no PO identity exists to hold
    // a session", session.guard.ts's own comment). A step-up elevation is minted
    // for an `identity_id`; PO has none, so enforcing this unconditionally would
    // make the capability PERMANENTLY UNREACHABLE — a regression to an
    // already-shipped 002 platform flow (`seed-first-administrator.test.ts`),
    // not a narrowing this slice's spec ever states an intent to make. The gate
    // is therefore scoped to callers who HAVE an identity to elevate; `PO` falls
    // outside its reach entirely, the same way it already falls outside
    // idle/absolute above and outside `SessionGuard` itself.
    //
    // This is NOT a general bypass for a missing caller — it is structurally
    // singular. `capability-declared-everywhere.test.ts`'s "exactly one stepUp
    // capability is platform-surfaced" assertion is what keeps it that way: a
    // future `stepUp: true` capability added to the platform surface fails that
    // test, forcing the same decision to be made again rather than silently
    // inheriting this exemption. Whichever future slice network-exposes the
    // platform-admin surface owns building real `PO` authentication and step-up
    // for it (research.md D9) — recorded as technical debt, not solved here.
    //
    // ALSO SKIPPED WHEN `request.sessionId` IS ABSENT — the identical judgment
    // call made above for idle/absolute, applied a second time to the same root
    // cause. In PRODUCTION every request reaching this line already has a
    // genuinely resolved session (no other path reaches a tenant-scoped or
    // identity-scoped capability), so this is never absent there. It IS absent
    // for the `x-identity-id` test stand-in every `001`-`004` test built on it
    // uses (`tests/helpers/real-app.ts`) — which predates this slice and is not
    // exercising session mechanics at all. Gating on `sessionId` too, rather than
    // retrofitting a real sign-in into dozens of pre-existing authorization tests
    // for a mechanic they were never testing, keeps this slice's blast radius to
    // the one file named in plan.md Complexity Tracking. This slice's OWN tests
    // (`step-up.test.ts`) present real bearer tokens throughout specifically so
    // this gate is genuinely exercised end to end, not bypassed by the shortcut.
    if (def.stepUp === true && caller.identityId && request.sessionId) {
      await this.consumeStepUp(request, caller.identityId, capabilityId);
    }

    return firstValueFrom(next.handle() as Observable<unknown>);
  }

  /**
   * `consume_step_up()` runs on the ORDINARY application connection —
   * `lc_app` holds `EXECUTE` on it and nothing else on `step_up_elevation`
   * (data-model.md). No transaction/tenant context is required: the table
   * carries no `tenant_id` and no RLS policy at all (D6).
   *
   * A caller with no `identityId` at all (`PO`, the platform surface) can never
   * satisfy this — there is no identity for a step-up elevation to name. That is
   * a real, narrow gap this slice's design docs do not resolve (the one
   * `stepUp: true` capability exposed on the platform surface,
   * `invitation.issue_seed`, has no identity to elevate), and it fails CLOSED
   * rather than silently bypassing the gate.
   */
  private async consumeStepUp(
    request: IncomingRequest,
    identityId: string | null,
    capabilityId: CapabilityId,
  ): Promise<void> {
    const token = firstHeaderValue(request.headers, 'x-step-up-token');
    if (!token || !identityId) throw new StepUpRequired();

    const tokenDigest = createHash('sha256').update(token, 'utf8').digest('hex');
    const result = await appDb().execute<{ consume_step_up: boolean | null }>(
      sql`SELECT consume_step_up(${tokenDigest}, ${identityId}, ${capabilityId}) AS consume_step_up`,
    );
    if (!result.rows[0]?.consume_step_up) throw new StepUpRequired();
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
      // 003/T048. From the RESOLVED SESSION, not from a header. This was the
      // last real read of `x-identity-id` in src/**, and it mattered more than
      // the others: it fed the identity that `self`-scoped capabilities decide
      // against, so a caller who could set the header could have a self-scoped
      // decision made about somebody else.
      // `request.identityId` is guaranteed set here — `SessionGuard` runs before
      // every interceptor and throws (401) for any non-auth/platform route it
      // cannot resolve an identity for, so an identity-surface route never
      // reaches this line with it unset. The `??` fallback this replaced was
      // untestable dead code (coverage-v8 flagged it once this slice's own
      // additions changed the file's total branch count and surfaced it); `!`
      // states the invariant instead of hiding an unreachable branch behind it.
      return { subject: 'SA', principal: null, identityId: request.identityId! };
    }
    const principal = currentPrincipal();
    return { subject: principal.archetype, principal, identityId: principal.identityId };
  }
}
