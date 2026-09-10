/**
 * T031 — the session guard. research.md D8 and D10, FR-034, FR-041.
 *
 * A GUARD RATHER THAN AN INTERCEPTOR, and this is the one place in this codebase
 * where that is the right answer. Constitution v1.4.0 corrected tenant scope,
 * permissions and entitlement from guards to interceptors, because each needs the
 * resolved principal and NestJS runs every Guard before any Interceptor. This one
 * inverts that dependency: it needs nothing prior, and everything else needs it.
 * Running before the interceptors is exactly the property required — it is what
 * lets `TenantContextInterceptor` and 002's membership resolution find a proven
 * identity already on the request instead of trusting a header.
 *
 * IT RESOLVES THROUGH `resolve_session()` ON THE ORDINARY APPLICATION CONNECTION,
 * not through `lc_auth`. That is the entire reason that one function is EXECUTE-
 * granted to `lc_app` (D8): resolution happens on EVERY request, before
 * `app.identity_id` exists, so no RLS policy could scope it — and a table grant
 * would let `lc_app` read every session row when it only ever needs one.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: decide anything about tenants, archetypes or
 * permissions. It answers one question — is this person who they claim to be — and
 * leaves which firm they may reach to `membership` under RLS (002/FR-016). That
 * separation is what keeps the identity layer replaceable.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_SURFACE } from '../permissions/guard';
import { sql } from 'drizzle-orm';
import { appDb } from '../db/client';
import { digestToken } from './session.port';

/**
 * Marks the four authentication routes, which must be reachable WITHOUT a session
 * — they are how a session comes to exist. contracts/README.md states this
 * explicitly so an ungated authentication route is not later filed as a defect.
 */
export const AUTH_SURFACE = 'auth:surface';
export const AuthSurface = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTH_SURFACE, true);

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Set by this guard, read by the tenant and identity contexts. */
  identityId?: string;
}

function bearerToken(headers: AuthenticatedRequest['headers']): string | null {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1]!.trim() : null;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAuthSurface = this.reflector.getAllAndOverride<boolean>(AUTH_SURFACE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAuthSurface) return true;

    // THE PLATFORM SURFACE STAYS EXEMPT, AND THIS IS A GAP RATHER THAN A DESIGN.
    //
    // 001 shipped it authenticating nothing, bound to loopback, with main.ts
    // warning that it "must not be network-reachable before slice 003". This
    // slice brings 002's TENANT surfaces onto the network — that is what
    // research.md D10 is about — and it does not close the platform surface,
    // because there is nothing here to close it with: PO is a vendor role and not
    // a tenant membership, so no PO identity exists to hold a session, and
    // inventing one would be a capability no spec asked for.
    //
    // The loopback binding therefore remains the control, unchanged, and
    // main.ts's warning remains accurate with its slice number now stale. Recorded
    // in .spec-context.json as a concern rather than left to be discovered by
    // whoever first tries to expose this surface.
    const isPlatformSurface = this.reflector.getAllAndOverride<boolean>(PLATFORM_SURFACE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPlatformSurface) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Already established by server-side wiring earlier in the chain. In
    // PRODUCTION nothing does this — `AppModule` installs no such middleware, and
    // `identityId` is a property on the request object, which no HTTP client can
    // set: headers, query and body all land elsewhere. The only thing that
    // populates it is `tests/helpers/real-app.ts`, which is where 002's
    // `x-identity-id` stand-in now lives and the only place it may live (FR-041,
    // SC-030 — accepted on ZERO network-reachable surfaces).
    if (request.identityId) return true;

    const token = bearerToken(request.headers);

    // No token, an unknown token, an expired one and a revoked one all reach the
    // same refusal with the same body. Distinguishing them would disclose whether
    // a session had ever existed (FR-022's discipline, applied to the session).
    if (!token) throw new UnauthorizedException('No autenticado.');

    const result = await appDb().execute<{ identity_id: string }>(
      sql`SELECT identity_id FROM resolve_session(${digestToken(token)})`,
    );
    const identityId = result.rows[0]?.identity_id;
    if (!identityId) throw new UnauthorizedException('No autenticado.');

    request.identityId = identityId;
    return true;
  }
}
