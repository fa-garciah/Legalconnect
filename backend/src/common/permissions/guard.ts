/**
 * Surface metadata. The permission decision itself lives in `common/authz/` (004) —
 * `matrix.ts` decides who holds a capability, and `AuthorizationInterceptor` is the
 * only code that reads it. `RequireArchetypes` lived here until 004: it was deleted
 * rather than kept alongside `@Capability`, because two mechanisms deciding one rule
 * is how they diverge (plan.md Complexity Tracking).
 *
 * There is deliberately no Guard here, for `AuthorizationInterceptor` the same reason
 * this file once gave for `RequireArchetypes`: NestJS runs Guards before Interceptors,
 * unconditionally, for every request, and neither the principal nor the tenant's plan
 * exists yet at that point — both are only ever set by interceptors further in
 * (research.md D2). The platform and identity surface markers below are read directly
 * by every interceptor that needs them, `AuthorizationInterceptor` included.
 */
import { SetMetadata } from '@nestjs/common';

/** Marks an endpoint as not tenant-scoped — the platform administration surface. */
export const PLATFORM_SURFACE = 'platformSurface';
export const PlatformSurface = () => SetMetadata(PLATFORM_SURFACE, true);

/**
 * Marks an endpoint as identity-only — no tenant active at all (slice 002,
 * research.md D3). The self-service surface: enumerate-own-memberships and
 * accept-invitation. See `common/identity/context.ts`.
 */
export const IDENTITY_SURFACE = 'identitySurface';
export const IdentitySurface = () => SetMetadata(IDENTITY_SURFACE, true);
