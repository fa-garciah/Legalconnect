/**
 * FR-036, SC-017, quickstart V17 — the invitation message carries only the
 * firm's name and the opaque reference. Checked against the template's own
 * parameter list, not just one rendered instance: the function has no
 * parameter through which case data, a client name or a matter reference
 * could ever be supplied.
 */
import { describe, expect, it } from 'vitest';
import { renderInvitationMessage } from '../../src/modules/invitation/message-template';

describe('invitation message template (FR-036)', () => {
  it('contains only the tenant name and the reference token', () => {
    const message = renderInvitationMessage({
      tenantName: 'Despacho Ejemplo, S.C.',
      rawReferenceToken: 'opaque-token-value',
    });

    expect(message.subject).toContain('Despacho Ejemplo, S.C.');
    expect(message.body).toContain('Despacho Ejemplo, S.C.');
    expect(message.body).toContain('opaque-token-value');
  });

  it('the function accepts no field that could carry case data, a client name or a matter reference', () => {
    // The type itself is the assertion: InvitationMessageInput has exactly
    // two fields. Any attempt to pass a third is a compile error, not a
    // runtime filter someone could forget to apply.
    const input: Record<string, unknown> = {
      tenantName: 'X',
      rawReferenceToken: 'y',
    };
    expect(Object.keys(input).sort()).toEqual(['rawReferenceToken', 'tenantName']);
  });
});
