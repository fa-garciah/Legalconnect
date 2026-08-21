/**
 * The invitation's bearer credential. research.md D2.
 *
 * The raw token is what appears in the invitation email/URL and is NEVER
 * stored. Only its SHA-256 hash goes into `invitation.reference_hash`.
 * PostgreSQL's own lookup by that hash is `accept_invitation()`
 * (backend/drizzle/0015).
 *
 * A fast hash is the right tool here, unlike backup codes: the token carries
 * 256 bits of entropy, so brute-forcing the hash is infeasible regardless of
 * hash speed — a memory-hard function exists to slow down guessing a
 * low-entropy secret, which this is not.
 */
import { createHash, randomBytes } from 'node:crypto';

export interface InvitationToken {
  /** The value to embed in the email/URL. Never persisted. */
  readonly raw: string;
  /** What actually goes into `invitation.reference_hash`. */
  readonly hash: string;
}

export function generateInvitationToken(): InvitationToken {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashInvitationToken(raw) };
}

export function hashInvitationToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}
