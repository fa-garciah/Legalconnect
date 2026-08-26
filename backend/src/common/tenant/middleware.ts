/**
 * T046 / T051 — the global tenant context mechanism.
 *
 * Implemented as a Nest INTERCEPTOR rather than Express middleware, despite the task
 * naming. The transaction must stay open around the handler so `set_config(..., true)`
 * and every query the handler makes land on the same connection and transaction.
 * Express middleware cannot wrap the downstream handler in a promise it controls —
 * only an interceptor can — and doing it in middleware would mean holding the
 * transaction open across `next()` and closing it on a response event, which is
 * exactly the fragile arrangement the constitution's Prisma prohibition is about.
 *
 * `set_config(..., true)` rather than literal `SET LOCAL`: utility statements take no
 * bind parameters, so `SET LOCAL` would require concatenating a request value into SQL
 * text. Both are transaction-scoped, which is the property that matters — the setting
 * dies with the transaction and cannot leak into a neighbouring request through the
 * pool.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import { sql } from 'drizzle-orm';
import { appDb, type Tx } from '../db/client';
import type { ActivePrincipal, Channel } from './principal';
import { resolvePrincipal } from './resolve';
import { MEMBERSHIP_PORT, type MembershipPort } from './membership';
import { refusalToHttp, shouldAudit } from './refusals';
import { recordCrossTenantAttempt } from './record-attempt';
import { IDENTITY_SURFACE, PLATFORM_SURFACE } from '../permissions/guard';
import { firstHeaderValue } from '../http/header';

interface TenantContext {
  readonly tx: Tx;
  readonly principal: ActivePrincipal;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * The transaction of the currently active tenant context.
 *
 * Throws rather than returning undefined if nothing is active. A handler that reached
 * the database without a context is a bug, and it should be loud here — the silent
 * version of that bug is what the no-context test exists to catch at the data layer.
 */
export function currentTx(): Tx {
  const context = storage.getStore();
  if (!context) throw new Error('no tenant context is active for this call');
  return context.tx;
}

export function currentPrincipal(): ActivePrincipal {
  const context = storage.getStore();
  if (!context) throw new Error('no tenant context is active for this call');
  return context.principal;
}

/**
 * Exactly one tenant, active for the whole transaction. FR-022.
 *
 * Also sets `app.identity_id` (research.md D3, slice 002) — the same setting
 * `GET /identity/memberships` uses alone, with no tenant active. Setting both
 * together here is what lets `membership`'s second, identity-scoped SELECT
 * policy stay harmless inside an ordinary tenant session: it only ever matches
 * the caller's own row, which the tenant-scoped policy already permitted.
 */
export async function runInTenantContext<T>(
  principal: ActivePrincipal,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return appDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${principal.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.identity_id', ${principal.identityId}, true)`);
    return storage.run({ tx, principal }, () => fn(tx));
  });
}

interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: ActivePrincipal;
}

const header = (req: IncomingRequest, name: string): string | undefined =>
  firstHeaderValue(req.headers, name);

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    @Inject(MEMBERSHIP_PORT) private readonly memberships: MembershipPort,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // The platform administration surface is exempt (FR-009), and so is the
    // identity-only self-service surface (slice 002, research.md D3) — neither
    // has a tenant to activate. Both exemptions are read from an explicit
    // declaration on the route, so opting out of tenant scope is a visible,
    // reviewable act rather than a property of the URL.
    const isPlatform = this.reflector.getAllAndOverride<boolean>(PLATFORM_SURFACE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isIdentityOnly = this.reflector.getAllAndOverride<boolean>(IDENTITY_SURFACE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPlatform || isIdentityOnly) return next.handle();

    return from(this.activate(context, next));
  }

  private async activate(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const request = context.switchToHttp().getRequest<IncomingRequest>();
    const identityId = header(request, 'x-identity-id');
    const tenantId = header(request, 'x-tenant-id');
    const channel: Channel = header(request, 'x-channel') === 'automated' ? 'automated' : 'interactive';

    const resolution = await resolvePrincipal({ identityId, tenantId }, this.memberships);

    if (!resolution.ok) {
      if (shouldAudit(resolution.reason) && tenantId) {
        // shouldAudit is true only for no_live_membership/membership_revoked, and
        // resolvePrincipal can only reach either after identityId already passed
        // its own format check — so identityId is never undefined here.
        await recordCrossTenantAttempt({
          targetTenantId: tenantId,
          targetEntity: 'tenant',
          targetId: tenantId,
          actorIdentityId: identityId,
          source: { channel, clientClass: 'http' },
        });
      }
      throw refusalToHttp(resolution.reason);
    }

    request.principal = resolution.principal;

    // Archetype (and everything else Principle IV governs) is decided by
    // AuthorizationInterceptor against matrix.ts, not here (004, research.md D2) —
    // this interceptor's job ends at resolving the principal and opening the
    // transaction. It used to enforce archetype itself, for the same reason a Guard
    // could not: `request.principal` does not exist until resolution above succeeds,
    // and no Guard runs late enough to see it. AuthorizationInterceptor nests inside
    // this one for the same reason, one interceptor further in.
    return runInTenantContext(resolution.principal, async () =>
      firstValueFrom(next.handle() as Observable<unknown>),
    );
  }
}
