/**
 * T012 (extended by T041) — research.md D3: classifies a failed response's
 * `(status, error.code)` into the bucket `ErrorState` renders from. Never inspects
 * response *text*, only the fixed wire shape 004/contracts/refusal.md §2 already
 * establishes — a reworded message must never change which bucket renders.
 */
import type { FailedResponse } from '../lib/api-client';

export type RefusalBucket = 'opaque' | 'role' | 'entitlement-feature' | 'entitlement-limit';

export interface ClassifiedRefusal {
  readonly bucket: RefusalBucket;
  /** Only for entitlement-feature — the capability id 004's body carries. */
  readonly capability?: string;
  /** Only for entitlement-limit — the { key, value } 004's body carries. */
  readonly limit?: { readonly key: string; readonly value: number };
}

const OPAQUE: ClassifiedRefusal = { bucket: 'opaque' };
const ROLE: ClassifiedRefusal = { bucket: 'role' };

export function classifyRefusal(response: FailedResponse | null): ClassifiedRefusal {
  // No response at all — network failure. Opaque, no security cause (FR-024).
  if (response === null) return OPAQUE;

  const code = response.body.error.code;

  switch (code) {
    case 'not_found':
      return OPAQUE;
    // Deliberate override (research.md D3): reaching this already proves a genuine
    // live membership, so it is NOT a disclosure risk at the wire level — but
    // spec.md User Story 4 scenario 7 requires it opaque anyway, ahead of every
    // distinction 004's own Refusal Ordering would otherwise permit. Do not "fix"
    // this back into the role bucket; it is deliberate, not an oversight.
    case 'mfa_enrollment_required':
      return OPAQUE;
    case 'not_authorized':
      // Covers BOTH `permission` and `scope` (self kind) refusals — 004's own wire
      // mapping gives them the identical code (research.md D3). A `scope` (assigned
      // kind) refusal maps to `not_found` instead, deliberately identical to the
      // opaque bucket (004/research.md D6) — no `assigned`-scope capability exists
      // yet, so that case is not reachable through any real response today.
      return ROLE;
    case 'entitlement_required':
      return { bucket: 'entitlement-feature', capability: response.body.capability };
    case 'limit_reached':
      return { bucket: 'entitlement-limit', limit: response.body.limit };
    default:
      // An unrecognised status/code pair — a genuine technical failure this module
      // was not told how to name. Opaque, never a guess.
      return OPAQUE;
  }
}
