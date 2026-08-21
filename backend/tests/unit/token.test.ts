import { describe, expect, it } from 'vitest';
import { generateInvitationToken, hashInvitationToken } from '../../src/modules/invitation/token';

describe('invitation token (research.md D2)', () => {
  it('never stores the raw value — hash is deterministic, raw is not the hash', () => {
    const token = generateInvitationToken();
    expect(token.hash).toBe(hashInvitationToken(token.raw));
    expect(token.hash).not.toBe(token.raw);
  });

  it('two generated tokens never collide in practice', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it('the raw token carries enough entropy that its own length is not the security boundary', () => {
    const { raw } = generateInvitationToken();
    // 32 random bytes, base64url-encoded — long enough that guessing the hash
    // is the infeasible part, not brute-forcing this length.
    expect(raw.length).toBeGreaterThanOrEqual(40);
  });

  it('hashing is deterministic for the same input', () => {
    expect(hashInvitationToken('same-value')).toBe(hashInvitationToken('same-value'));
  });
});
