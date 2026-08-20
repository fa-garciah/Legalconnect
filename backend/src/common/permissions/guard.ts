/**
 * Permission metadata. CONTINGENT on plan.md open item 1 — the constitution puts
 * the full permissions matrix in slice 004; this is the seam it fills in.
 *
 * There is deliberately no Guard here. NestJS runs Guards before Interceptors,
 * unconditionally, for every request — and `request.principal` is only ever set by
 * TenantContextInterceptor, which is an interceptor. A guard reading
 * `request.principal` would find it undefined on every request and refuse
 * everything, archetype notwithstanding. So `TenantContextInterceptor` itself
 * enforces `RequireArchetypes`, immediately after it resolves the principal — see
 * `backend/src/common/tenant/middleware.ts`. The platform surface's own exemption is
 * likewise read directly from `PLATFORM_SURFACE` by each interceptor that needs it.
 */
import { SetMetadata } from '@nestjs/common';
import type { Archetype } from '../tenant/principal';

export const REQUIRED_ARCHETYPES = 'requiredArchetypes';

/** Deny by default: an endpoint with no declaration is unreachable, not open. */
export const RequireArchetypes = (...archetypes: readonly Archetype[]) =>
  SetMetadata(REQUIRED_ARCHETYPES, archetypes);

/** Marks an endpoint as not tenant-scoped — the platform administration surface. */
export const PLATFORM_SURFACE = 'platformSurface';
export const PlatformSurface = () => SetMetadata(PLATFORM_SURFACE, true);
