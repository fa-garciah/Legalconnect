/**
 * The identity-only context (research.md D3). The self-enumeration analogue of
 * `common/tenant/middleware.ts` — no tenant is ever active here, only the
 * caller's own identity.
 *
 * Used by exactly one route, `GET /identity/memberships` (FR-017). Not used by
 * accept-invitation: that route calls `accept_invitation()` directly and needs
 * no session context at all, since the caller may not have an identity yet.
 * Both routes still declare `@IdentitySurface()` so `TenantContextInterceptor`
 * skips them — see `common/tenant/middleware.ts`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, firstValueFrom, from } from 'rxjs';
import { sql } from 'drizzle-orm';
import { appDb, type Tx } from '../db/client';
import { ValidationFailed } from '../http/errors';

const storage = new AsyncLocalStorage<{ tx: Tx; identityId: string }>();

/**
 * Throws rather than returning undefined, the same choice
 * `common/tenant/middleware.ts` makes for `currentTx()` — a handler that
 * reached the database with no identity context active is a bug, and it
 * should be loud here.
 */
export function currentIdentityTx(): Tx {
  const context = storage.getStore();
  if (!context) throw new Error('no identity context is active for this call');
  return context.tx;
}

export function currentIdentityId(): string {
  const context = storage.getStore();
  if (!context) throw new Error('no identity context is active for this call');
  return context.identityId;
}

interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  /** 003/T033. Set by `SessionGuard`, which runs before every interceptor. */
  identityId?: string;
}

@Injectable()
export class IdentityContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.activate(context, next));
  }

  private async activate(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const request = context.switchToHttp().getRequest<IncomingRequest>();

    // 003/T033. From the resolved session, not from `x-identity-id`. The header
    // was 002/D10's stand-in for a verification that did not exist yet; it does
    // now, and a self-enumeration route reading an unverified header would let
    // anyone list anyone's memberships.
    const identityId = request.identityId;

    if (!identityId) {
      // Should be unreachable — `SessionGuard` refuses before any interceptor
      // runs. Kept as a loud failure rather than a silent one, because the cost
      // of being wrong here is enumerating another person's memberships.
      throw new ValidationFailed('No authenticated identity was supplied.');
    }

    return appDb().transaction(async (tx) => {
      // No app.tenant_id here at all — this is the one deliberate exception to
      // "a tenant session never enumerates another tenant's data": there is no
      // tenant session in the first place.
      await tx.execute(sql`SELECT set_config('app.identity_id', ${identityId}, true)`);
      return storage.run({ tx, identityId }, () =>
        firstValueFrom(next.handle() as Observable<unknown>),
      );
    });
  }
}
