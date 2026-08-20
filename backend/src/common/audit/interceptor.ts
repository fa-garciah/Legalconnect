/**
 * T059 — the global interceptor that appends an audit entry for every mutation.
 *
 * Global, never per endpoint. The constitution is explicit that an endpoint which has
 * to apply this by hand is a design violation: the mechanism must apply by default so
 * that omitting it is an explicit, reviewable act rather than a possible oversight.
 *
 * It must nest INSIDE TenantContextInterceptor, which opens the transaction — so it is
 * registered second in app.module.ts. Registration order is load-bearing here: the
 * outermost interceptor runs first, and this one needs `currentTx()` to already exist.
 *
 * The append happens AFTER the handler succeeds but BEFORE the transaction commits.
 * That ordering is what gives FR-017 its teeth: a failed append propagates, the
 * enclosing transaction rolls back, and the mutation leaves no trace.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import { appendAuditEntry } from './append';
import { TARGET_ENTITY_BY_ACTION, type AuditAction } from './actions';
import { buildSource } from './source';
import { actorFromPrincipal, PLATFORM_ACTOR } from './actor';
import { currentPrincipal, currentTx } from '../tenant/middleware';
import { currentPlatformTx } from '../db/platform-context';

export const AUDITED = 'audited';

export interface AuditedOptions {
  readonly action: AuditAction;
  readonly targetEntity?: string;
  /** True for the platform administration surface, which has no membership. */
  readonly platform?: boolean;
}

/**
 * Declares what an endpoint records. An endpoint that mutates and carries no
 * `@Audited` writes nothing — which is why `tasks.md` pairs this with a review rule
 * rather than trusting the decorator alone. Making the absence visible in the source
 * is the best a decorator can do.
 */
export const Audited = (options: AuditedOptions) => SetMetadata(AUDITED, options);

/** Extra detail for the entry, set by a handler during the request. */
const metadataBag = new WeakMap<object, Record<string, unknown>>();

export function addAuditMetadata(request: object, extra: Record<string, unknown>): void {
  metadataBag.set(request, { ...(metadataBag.get(request) ?? {}), ...extra });
}

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  auditTargetId?: string | null;
}

const header = (req: RequestLike, name: string): string | undefined => {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const declared = this.reflector.getAllAndOverride<AuditedOptions | undefined>(AUDITED, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Reads and anything undeclared pass straight through. Only declared mutations
    // record — FR-014 enumerates a closed set of events, not "everything".
    if (!declared) return next.handle();

    return from(this.record(context, next, declared));
  }

  private async record(
    context: ExecutionContext,
    next: CallHandler,
    declared: AuditedOptions,
  ): Promise<unknown> {
    const result = await firstValueFrom(next.handle() as Observable<unknown>);

    const request = context.switchToHttp().getRequest<RequestLike>();
    const metadata = metadataBag.get(request as object) ?? {};

    // Not sanitised here: appendAuditEntry is the choke point, so every path crosses
    // it rather than only this one. It refuses on sensitive data, and because that
    // happens inside the mutation's transaction the mutation rolls back with it.

    const actor = declared.platform ? PLATFORM_ACTOR : actorFromPrincipal(currentPrincipal());
    const tenantId = declared.platform
      ? ((request.auditTargetId ?? null) as string)
      : currentPrincipal().tenantId;

    // A platform route that reached here without setting auditTargetId has nothing to
    // attribute the entry to. Skipping is correct rather than guessing: a read that
    // found nothing, or a mutation that was refused, must not appear in any log.
    if (declared.platform && !tenantId) return result;

    // Whichever surface this is, the append lands in THAT surface's transaction. The
    // two contexts are separate mechanisms (research.md D9) but share the discipline
    // that makes FR-017 hold.
    const tx = declared.platform ? currentPlatformTx() : currentTx();

    await appendAuditEntry(tx, {
      tenantId,
      action: declared.action,
      targetEntity: declared.targetEntity ?? TARGET_ENTITY_BY_ACTION[declared.action],
      targetId: request.auditTargetId ?? null,
      actorIdentityId: actor.actorIdentityId,
      actorMembershipId: actor.actorMembershipId,
      source: buildSource({
        channel: header(request, 'x-channel'),
        userAgent: header(request, 'user-agent'),
        ip: request.ip,
      }),
      metadata,
    });

    return result;
  }
}
