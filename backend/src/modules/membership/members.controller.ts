/**
 * 014-admin-ui, Decision 5 — `GET /tenant/members`. contracts/admin-screens.md §1.2.
 *
 * The administration screen's user list: each LIVE member of the active firm with the email
 * that tells one person from another. `@Capability('membership.read_tenant')` (matrix row 5,
 * SA and MP) is decided by `AuthorizationInterceptor`; nothing here checks an archetype.
 *
 * The email is reachable only through migration 0044's policy on `identity`, which admits a row
 * only for a live member of the ACTIVE tenant. The `m.tenant_id` predicate below is therefore
 * belt and braces, not the boundary — `members-email-isolation.test.ts` proves the boundary.
 *
 * Audited as `membership.list_read` (channel-gated): a person reading the firm's members with
 * their email is a read of personal data (Principle VI). The entry names the firm, never an
 * email — the sanitiser would refuse one anyway.
 *
 * Unpaginated on purpose: a firm's member count is bounded by its plan's user limit, and the
 * screen shows them all at once.
 */
import { Controller, Get, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Audited } from '../../common/audit/interceptor';
import { Capability } from '../../common/authz/declare';
import { currentPrincipal, currentTx } from '../../common/tenant/middleware';

interface AuditableRequest {
  auditTargetId?: string | null;
}

export interface MemberItem {
  readonly membershipId: string;
  readonly email: string;
  readonly archetype: string;
  readonly positionName: string | null;
}

@Controller('tenant/members')
export class MembersController {
  @Get()
  @Capability('membership.read_tenant')
  @Audited({ action: 'membership.list_read', targetEntity: 'tenant' })
  async list(@Req() req: AuditableRequest): Promise<{ items: readonly MemberItem[] }> {
    const { rows } = await currentTx().execute<{
      membership_id: string;
      email: string;
      archetype: string;
      position_name: string | null;
    }>(sql`
      SELECT m.id        AS membership_id,
             i.email     AS email,
             m.archetype AS archetype,
             p.name      AS position_name
        FROM membership m
        JOIN identity i             ON i.id = m.identity_id
        LEFT JOIN directory_entry d ON d.membership_id = m.id
        LEFT JOIN position p        ON p.id = d.position_id
       WHERE m.status = 'live'
         AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
       ORDER BY lower(i.email), m.id
    `);

    req.auditTargetId = currentPrincipal().tenantId;
    return {
      items: rows.map((row) => ({
        membershipId: row.membership_id,
        email: row.email,
        archetype: row.archetype,
        positionName: row.position_name,
      })),
    };
  }
}
