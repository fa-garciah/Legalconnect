import { Module } from '@nestjs/common';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

/** FR-009, FR-012 — revoke and archetype-change. Tenant-scoped. */
@Module({
  controllers: [MembershipController],
  providers: [MembershipService],
})
export class MembershipModule {}
