/**
 * `POST /identity/invitations/{reference}/accept` — US3, contracts/self-service.md.
 *
 * `@IdentitySurface()` exempts this route from `TenantContextInterceptor`.
 * Unlike `MembershipsController`, it does NOT use `IdentityContextInterceptor`
 * — the caller may have no identity yet at all, and `accept_invitation()` is
 * self-contained, so no session context is opened around it.
 *
 * `x-subject`/`x-email` are research.md D10's test-only stand-in for what
 * slice 003 will verify for real.
 */
import { Controller, Headers, Param, Post } from '@nestjs/common';
import { IdentitySurface } from '../../common/permissions/guard';
import { ValidationFailed } from '../../common/http/errors';
import { AcceptInvitationService, type AcceptInvitationResult } from './accept-invitation.service';

@IdentitySurface()
@Controller('identity/invitations')
export class AcceptInvitationController {
  constructor(private readonly accept: AcceptInvitationService) {}

  @Post(':reference/accept')
  async acceptInvitation(
    @Param('reference') reference: string,
    @Headers('x-subject') subject: string | undefined,
    @Headers('x-email') email: string | undefined,
  ): Promise<AcceptInvitationResult> {
    if (!subject || !email) {
      throw new ValidationFailed('No authenticated subject was supplied.');
    }
    return this.accept.accept(reference, subject, email);
  }
}
