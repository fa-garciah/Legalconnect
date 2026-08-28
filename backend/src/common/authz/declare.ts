/**
 * T017 — `@Capability()`. Declares which capability a route exposes. No rule is
 * authored here: every rule lives in `matrix.ts`, and the only code that reads it is
 * `decide()` (Principle IV re-check, plan.md).
 */
import { SetMetadata } from '@nestjs/common';
import type { CapabilityId } from './capability';

export const CAPABILITY = 'capability';

/** An endpoint with no declaration is unreachable (FR-019) — on every surface. */
export const Capability = (id: CapabilityId) => SetMetadata(CAPABILITY, id);

export const SCOPE_TARGET = 'scope_target';

/**
 * `@ScopeTarget('caseId')` — names the route parameter carrying the id of the entity a
 * scope resolver must decide about. `AuthorizationInterceptor` reads it and puts that
 * parameter's value on `ScopeRequest.targetId`.
 *
 * Added by 006-client-case-core (its FR-013, research.md D2). Until that slice, this
 * interceptor set `targetId: null` unconditionally, which was correct while every
 * capability resolved at `tenant`, `self` or `none`: the two `self`-scoped routes name no
 * target, and `tenant` scope is decided from the principal alone. The first
 * `assigned`-scoped capability broke that — a resolver cannot answer "are you on THIS
 * case" without being told which case.
 *
 * **Why a decorator and not a convention.** Reading `request.params.id` by convention
 * would work until someone named a parameter differently, at which point `targetId` is
 * `undefined`, the resolver fails closed, and the caller gets a 404 — which is precisely
 * what a correct `assigned` refusal looks like (FR-016 makes them byte-identical by
 * design). The bug would hide behind a plausible refusal. An explicit declaration lets
 * `tests/contract/scope-target-declared.test.ts` fail the build instead.
 *
 * Inert on a route whose capability does not resolve at `assigned` scope, and that test
 * refuses it there too — an inert declaration reads as though scope were being enforced
 * where it is not.
 */
export const ScopeTarget = (paramName: string) => SetMetadata(SCOPE_TARGET, paramName);
