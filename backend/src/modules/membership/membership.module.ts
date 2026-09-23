import { Module } from '@nestjs/common';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';
import { MembersController } from './members.controller';

/**
 * FR-009, FR-012 — revoke and archetype-change. Tenant-scoped.
 * 014 (Decision 5) — `GET /tenant/members`, the administration screen's member list.
 */
@Module({
  controllers: [MembershipController, MembersController],
  providers: [MembershipService],
})
export class MembershipModule {}
