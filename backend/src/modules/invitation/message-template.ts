/**
 * FR-036 — the invitation message carries only the firm's name and an opaque
 * reference. This is what makes SC-017 checkable against the TEMPLATE rather
 * than against one rendered instance: there is no field here a caller could
 * ever populate with case data, a client name or a matter reference, because
 * the function's own parameter list has no such parameter to accept one.
 */
export interface InvitationMessageInput {
  readonly tenantName: string;
  readonly rawReferenceToken: string;
}

export interface InvitationMessage {
  readonly subject: string;
  readonly body: string;
}

export function renderInvitationMessage(input: InvitationMessageInput): InvitationMessage {
  return {
    subject: `Invitation to join ${input.tenantName} on LegalConnect MX`,
    body:
      `You have been invited to join ${input.tenantName} on LegalConnect MX.\n\n` +
      `Reference: ${input.rawReferenceToken}\n`,
  };
}
