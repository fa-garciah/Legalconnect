/**
 * 014 T009f (FR-026). The exchange `005` requires before a gated mutation.
 *
 * `POST /auth/step-up { capability, code }` answers `{ stepUpToken, expiresAt }`; the gated
 * request then carries the token as `x-step-up-token`, which the proxy forwards (FR-027). The
 * token is bound to one identity and one capability, consumed on first use, and lives two
 * minutes — so it is asked for immediately before the action it covers, held in component
 * state only for that one request, and never written anywhere else (the `003/FR-051` rule).
 *
 * Only the refusal's CLASS is returned. `005/FR-020` answers a wrong code and an expired
 * challenge identically, and this module does not try to tell them apart either.
 */
import { apiFetch } from '../lib/api-client';

/** The step-up capabilities `/configuracion` exercises (`matrix.ts`, `stepUp: true`). */
export type StepUpCapability =
  | 'invitation.issue'
  | 'invitation.revoke'
  | 'membership.revoke'
  | 'membership.change_archetype';

export type StepUpOutcome =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly reason: 'refused' | 'unreachable' };

/** The code an authenticator app shows: exactly six digits. */
export function isSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export async function requestStepUp(capability: StepUpCapability, code: string): Promise<StepUpOutcome> {
  const result = await apiFetch<{ stepUpToken: string; expiresAt: string }>('/auth/step-up', {
    method: 'POST',
    body: JSON.stringify({ capability, code }),
  });
  if (result.ok) return { ok: true, token: result.data.stepUpToken };
  return { ok: false, reason: result.status === null ? 'unreachable' : 'refused' };
}

/** The header a gated request carries. One place, so no caller spells it differently. */
export function stepUpHeaders(token: string): Record<string, string> {
  return { 'x-step-up-token': token };
}
