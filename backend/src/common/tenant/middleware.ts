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
import { Observable, firstValueFrom, from } from 'rxjs';
import { sql } from 'drizzle-orm';
import { appDb, type Tx } from '../db/client';
import type { ActivePrincipal, Channel } from './principal';
import { resolvePrincipal } from './resolve';
import { MEMBERSHIP_PORT, type MembershipPort } from './membership';
import { refusalToHttp, shouldAudit } from './refusals';
import { recordCrossTenantAttempt } from './record-attempt';

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

/** Exactly one tenant, active for the whole transaction. FR-022. */
export async function runInTenantContext<T>(
  principal: ActivePrincipal,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return appDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${principal.tenantId}, true)`);
    return storage.run({ tx, principal }, () => fn(tx));
  });
}

interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: ActivePrincipal;
}

const header = (req: IncomingRequest, name: string): string | undefined => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(@Inject(MEMBERSHIP_PORT) private readonly memberships: MembershipPort) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
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
        // Recorded against the tenant that was NAMED — the firm whose data was
        // reached for is the one with a reason to know.
        await recordCrossTenantAttempt({
          targetTenantId: tenantId,
          targetEntity: 'tenant',
          targetId: tenantId,
          actorIdentityId: identityId ?? null,
          source: { channel, clientClass: 'http' },
        });
      }
      throw refusalToHttp(resolution.reason);
    }

    request.principal = resolution.principal;

    return runInTenantContext(resolution.principal, async () =>
      firstValueFrom(next.handle() as Observable<unknown>),
    );
  }
}
