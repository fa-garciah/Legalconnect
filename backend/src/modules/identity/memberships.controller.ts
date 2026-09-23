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
import { Capability } from '../../common/authz/declare';
import { IdentityContextInterceptor, currentIdentityId, currentIdentityTx } from '../../common/identity/context';
import type { Archetype } from '../../common/tenant/principal';

export interface OwnMembershipItem {
  readonly membershipId: string;
  readonly tenantId: string;
  /**
   * The firm's own name. Added because `016a/FR-008` requires the shell to name the
   * active firm at all times and this is the only endpoint that can say it — a switcher
   * offering a choice between two UUIDs is not a choice. Reachable through
   * `tenant_own_membership_select` (0043), which exposes a tenant row only to an identity
   * holding a live membership in it.
   */
  readonly tenantName: string;
  readonly archetype: Archetype;
}

@IdentitySurface()
@Controller('identity/memberships')
export class MembershipsController {
  @Get()
  @Capability('membership.read_own')
  @UseInterceptors(IdentityContextInterceptor)
  async list(): Promise<{ identityId: string; items: readonly OwnMembershipItem[] }> {
    /*
     * The join is INNER, and that is the safe direction rather than a convenience.
     *
     * `membership` is already filtered to the caller by `membership_own_identity_select`,
     * and `tenant` by `tenant_own_membership_select` (0043). A row survives only when BOTH
     * policies admit it, so a membership whose tenant the caller may not read disappears
     * from the list instead of appearing with a null name. That is the correct failure:
     * this endpoint's entire purpose is to enumerate firms the caller can act in, and one
     * they cannot even see the name of is not one of them.
     */
    const result = await currentIdentityTx().execute<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      archetype: Archetype;
      identity_id: string;
    }>(sql`
      SELECT m.id, m.tenant_id, m.identity_id, t.name AS tenant_name, m.archetype
      FROM membership m
      JOIN tenant t ON t.id = m.tenant_id
      WHERE m.status = 'live'
      ORDER BY t.name
    `);

    return {
      /*
       * Read from the CONTEXT, not from the rows.
       *
       * The first version took it from `rows[0]`, which is correct whenever there is a row
       * and silently wrong when there is not: an identity with zero live memberships got
       * back an empty string — the exact shape `getPrincipal()` uses for NOBODY IS SIGNED
       * IN. The frontend could then not tell "your session died" from "you belong to no
       * firm yet", and rendered the same dead end for both (002/FR-011 makes the second a
       * perfectly valid state, so conflating them is a real loss).
       *
       * The context value is what `SessionGuard` resolved from the presented session, so it
       * is exactly as trustworthy as the RLS predicate that uses it.
       */
      identityId: currentIdentityId(),
      items: result.rows.map((row) => ({
        membershipId: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        archetype: row.archetype,
      })),
    };
  }
}
