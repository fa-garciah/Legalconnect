/**
 * `POST /identity/invitations/{reference}/accept` — US3, contracts/self-service.md.
 *
 * `@IdentitySurface()` exempts this route from `TenantContextInterceptor`.
 * Unlike `MembershipsController`, it does NOT use `IdentityContextInterceptor`
 * — the caller may have no identity yet at all, and `accept_invitation()` is
 * self-contained, so no session context is opened around it.
 *
 * 003/T035: `x-subject` IS GONE. The subject was the external IdP's identifier,
 * and there is no external IdP any more — the product generates it (D9). Leaving
 * the header would have left a caller able to name somebody else's subject and be
 * resolved to their identity. `x-email` also goes: the email and the credential
 * now arrive in the request BODY, because a credential must never travel in a
 * header that proxies and access logs routinely record.
 *
 * `@Capability('invitation.accept_own')` resolves at `self` scope with no target
 * named — there is no prior identity to compare against at the moment of accepting
 * (004, research.md D8) — so the archetype dimension is never consulted.
 */
import { Body, Controller, Param, Post } from '@nestjs/common';
import { IdentitySurface } from '../../common/permissions/guard';
import { Capability } from '../../common/authz/declare';
import { AuthSurface } from '../../common/auth/session.guard';
import { ValidationFailed } from '../../common/http/errors';
import { AcceptInvitationService, type AcceptInvitationResult } from './accept-invitation.service';

interface AcceptInvitationBody {
  readonly email?: string;
  readonly credential?: string;
}

@IdentitySurface()
@AuthSurface()
@Controller('identity/invitations')
export class AcceptInvitationController {
  constructor(private readonly accept: AcceptInvitationService) {}

  /**
   * `@AuthSurface()` because this route is how a person comes to HAVE a session —
   * requiring one to accept an invitation would be a circular precondition. It is
   * the same reason the four `/auth/*` routes carry it, and contracts/README.md
   * records it so an ungated authentication route is not later filed as a defect.
   */
  @Post(':reference/accept')
  @Capability('invitation.accept_own')
  async acceptInvitation(
    @Param('reference') reference: string,
    @Body() body: AcceptInvitationBody,
  ): Promise<AcceptInvitationResult> {
    if (!body?.email || !body?.credential) {
      throw new ValidationFailed('Se requieren correo y contraseña.');
    }
    return this.accept.accept(reference, body.email, body.credential);
  }
}
