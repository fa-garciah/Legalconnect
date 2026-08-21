import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { AcceptInvitationController } from './accept-invitation.controller';
import { AcceptInvitationService } from './accept-invitation.service';

/**
 * The identity-only surface (slice 002): enumerate own memberships (US1,
 * FR-017) and accept an invitation (US3). Neither route has a tenant active —
 * see `common/identity/context.ts` and `contracts/self-service.md`.
 */
@Module({
  controllers: [MembershipsController, AcceptInvitationController],
  providers: [AcceptInvitationService],
})
export class IdentityModule {}
