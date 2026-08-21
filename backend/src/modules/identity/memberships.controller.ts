/**
 * `GET /identity/memberships` — FR-017, US1 scenario 8.
 *
 * `@IdentitySurface()` exempts this route from `TenantContextInterceptor`
 * (no tenant is ever active here); `@UseInterceptors(IdentityContextInterceptor)`
 * is what actually sets `app.identity_id` for the query below to run under.
 * The two are independent declarations on purpose — see
 * `common/identity/context.ts`.
 *
 * Every live membership, across every tenant, in one list. This is the one
 * deliberate exception to "a tenant never sees another tenant's data": there
 * is no tenant active here at all, and the read is scoped to the identity via
 * `membership`'s second RLS policy (research.md D3), not by anything this
 * controller does.
 */
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { IdentitySurface } from '../../common/permissions/guard';
import { IdentityContextInterceptor, currentIdentityTx } from '../../common/identity/context';
import type { Archetype } from '../../common/tenant/principal';

export interface OwnMembershipItem {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly archetype: Archetype;
}

@IdentitySurface()
@Controller('identity/memberships')
export class MembershipsController {
  @Get()
  @UseInterceptors(IdentityContextInterceptor)
  async list(): Promise<{ items: readonly OwnMembershipItem[] }> {
    const result = await currentIdentityTx().execute<{
      id: string;
      tenant_id: string;
      archetype: Archetype;
    }>(sql`
      SELECT id, tenant_id, archetype FROM membership WHERE status = 'live'
    `);

    return {
      items: result.rows.map((row) => ({
        membershipId: row.id,
        tenantId: row.tenant_id,
        archetype: row.archetype,
      })),
    };
  }
}
