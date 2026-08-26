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
