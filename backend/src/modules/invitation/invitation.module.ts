import { Module } from '@nestjs/common';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';

/** US2 — issue, revoke, list. Tenant-scoped; see contracts/tenant-invitations.md. */
@Module({
  controllers: [InvitationController],
  providers: [InvitationService],
})
export class InvitationModule {}
