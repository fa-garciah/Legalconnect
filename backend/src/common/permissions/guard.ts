/**
 * The global permission guard — as a SHELL only.
 *
 * CONTINGENT on plan.md open item 1. The constitution puts the permissions mechanism
 * in slice 004 and states that applying such a concern per endpoint is a design
 * violation. FR-013 nonetheless needs an "authorized role" now, for the audit read.
 * This implements the recommended option (a): a global seam installed here, permitting
 * only SA, with the full matrix filled in behind the same seam by slice 004.
 *
 * If the lead chooses option (b) instead, this file and the audit read endpoint move
 * to slice 004 together.
 *
 * What matters architecturally is that it is registered GLOBALLY. A guard applied
 * endpoint-by-endpoint is the oversight the constitution warns about; a global one
 * makes exempting an endpoint an explicit, reviewable act.
 */
import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Archetype } from '../tenant/principal';
import { NotAuthorized } from '../http/errors';

export const REQUIRED_ARCHETYPES = 'requiredArchetypes';

/** Deny by default: an endpoint with no declaration is unreachable, not open. */
export const RequireArchetypes = (...archetypes: readonly Archetype[]) =>
  SetMetadata(REQUIRED_ARCHETYPES, archetypes);

/** Marks an endpoint as not tenant-scoped — the platform administration surface. */
export const PLATFORM_SURFACE = 'platformSurface';
export const PlatformSurface = () => SetMetadata(PLATFORM_SURFACE, true);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPlatform = this.reflector.getAllAndOverride<boolean>(PLATFORM_SURFACE, [
      context.getHandler(),
      context.getClass(),
    ]);
    // The platform surface sits outside the membership mechanism entirely (FR-009).
    // Its own authentication arrives with slices 002/003/005; until then it is bound
    // to loopback, which is enforced in main.ts rather than here.
    if (isPlatform) return true;

    const required = this.reflector.getAllAndOverride<readonly Archetype[]>(
      REQUIRED_ARCHETYPES,
      [context.getHandler(), context.getClass()],
    );

    // Deny by default. Principle IV.
    if (!required || required.length === 0) throw new NotAuthorized();

    const request = context.switchToHttp().getRequest<{ principal?: { archetype?: Archetype } }>();
    const archetype = request.principal?.archetype;
    if (!archetype || !required.includes(archetype)) throw new NotAuthorized();

    return true;
  }
}
