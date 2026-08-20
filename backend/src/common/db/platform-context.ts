/**
 * The transaction context for the PLATFORM ADMINISTRATION surface.
 *
 * A separate mechanism from the tenant one, deliberately. The tenant context activates
 * a tenant and verifies a membership; this one does neither, because platform
 * operations are cross-tenant by design (FR-009, research.md D9). Sharing one
 * mechanism would mean the tenant path carried a flag to skip its own checks, which is
 * exactly the "disable isolation" switch the separate-role design avoids.
 *
 * What it does share is the transaction discipline: the audit append must land inside
 * the same transaction as the mutation, or FR-017 is lost.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import { platformDb } from './platform-client';
import { PLATFORM_SURFACE } from '../permissions/guard';

type PlatformTx = Parameters<Parameters<ReturnType<typeof platformDb>['transaction']>[0]>[0];

const storage = new AsyncLocalStorage<{ tx: PlatformTx }>();

export function currentPlatformTx(): PlatformTx {
  const context = storage.getStore();
  if (!context) throw new Error('no platform context is active for this call');
  return context.tx;
}

export function hasPlatformContext(): boolean {
  return storage.getStore() !== undefined;
}

export async function runInPlatformContext<T>(fn: (tx: PlatformTx) => Promise<T>): Promise<T> {
  return platformDb().transaction(async (tx) => storage.run({ tx }, () => fn(tx)));
}

/**
 * Opens the platform transaction around the handler.
 *
 * Registered outermost on the platform surface, the same position the tenant
 * interceptor holds on the tenant surface, so the audit interceptor nesting inside it
 * finds a transaction either way.
 */
@Injectable()
export class PlatformContextInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only opens a transaction for routes that declared themselves platform routes.
    // Both this and the tenant interceptor are registered globally and each recognises
    // its own surface, so neither needs to know about the other's wiring — and a route
    // that declares nothing gets no context at all, which fails closed.
    const isPlatform = this.reflector.getAllAndOverride<boolean>(PLATFORM_SURFACE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPlatform) return next.handle();

    return from(
      runInPlatformContext(async () => firstValueFrom(next.handle() as Observable<unknown>)),
    );
  }
}

export type { PlatformTx };
