/**
 * T054 / quickstart V13 / SC-004 — each audited action produces exactly one entry
 * carrying all six required fields, and the two channel-gated actions emit only for an
 * interactive read.
 *
 * Both directions of the gate are asserted. Checking only that automated reads are
 * silent would pass against an implementation that stopped recording reads
 * altogether, which would break FR-014.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { closeAppDb } from '../../src/common/db/client';
import { runInTenantContext } from '../../src/common/tenant/middleware';
import { appendAuditEntry } from '../../src/common/audit/append';
import {
  AUDIT_ACTIONS,
  CHANNEL_GATED_ACTIONS,
  TARGET_ENTITY_BY_ACTION,
  type AuditAction,
} from '../../src/common/audit/actions';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import type { ActivePrincipal } from '../../src/common/tenant/principal';

/**
 * slice 002, backend/drizzle/0018: these four are reserved to
 * `accept_invitation()`/`lc_identity_writer` at the GRANT level — `lc_app`'s
 * own audit_event policy now refuses them by construction, the same
 * discipline as every other narrow exception in this system. They are
 * covered by their own dedicated tests exercising the real acceptance path
 * (tests/integration/accept-invitation-atomicity.test.ts and neighbours), not
 * by this generic sweep, which writes through the ordinary `lc_app` path.
 */
const RESERVED_TO_IDENTITY_WRITER: readonly string[] = [
  'identity.created',
  'membership.created',
  'invitation.accepted',
  'invitation.refused',
];

const UNCONDITIONAL = AUDIT_ACTIONS.filter(
  (a) => !CHANNEL_GATED_ACTIONS.has(a) && !RESERVED_TO_IDENTITY_WRITER.includes(a),
);
const GATED = AUDIT_ACTIONS.filter((a) => CHANNEL_GATED_ACTIONS.has(a));

describe('audit entry fields and channel gating', () => {
  let platform: Client;
  let tenants: SeededTenants;
  let principal: ActivePrincipal;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    principal = {
      identityId: '11111111-1111-4111-8111-111111111111',
      membershipId: '44444444-4444-4444-8444-444444444444',
      tenantId: tenants.a,
      archetype: 'SA',
    };
  });

  afterAll(async () => {
    await platform.end();
    await closeAppDb();
  });

  async function append(action: AuditAction, channel: 'interactive' | 'automated', marker: string) {
    return runInTenantContext(principal, async (tx) =>
      appendAuditEntry(tx, {
        tenantId: principal.tenantId,
        action,
        targetEntity: TARGET_ENTITY_BY_ACTION[action],
        targetId: tenants.a,
        actorIdentityId: principal.identityId,
        actorMembershipId: principal.membershipId,
        source: { channel, clientClass: 'test' },
        metadata: { marker },
      }),
    );
  }

  const fetch = async (marker: string) =>
    (
      await platform.query<{
        tenant_id: string;
        action: string;
        target_entity: string;
        occurred_at: Date;
        source: { channel?: string };
        actor_identity_id: string | null;
      }>(`SELECT * FROM audit_event WHERE metadata ->> 'marker' = $1`, [marker])
    ).rows;

  it('covers every action in the vocabulary — nineteen (001\'s seven, 002\'s nine, 017\'s three)', () => {
    // Guards against an action being added to FR-014/FR-031/017-FR-003 without a test reaching it.
    expect(AUDIT_ACTIONS).toHaveLength(19);
    expect(GATED).toHaveLength(2);
    expect(RESERVED_TO_IDENTITY_WRITER).toHaveLength(4);
    expect(UNCONDITIONAL).toHaveLength(19 - 2 - 4);
  });

  it('lc_app is refused at the grant level for the four identity-writer-reserved actions', async () => {
    for (const action of RESERVED_TO_IDENTITY_WRITER) {
      const marker = `reserved-${action}-${Date.now()}`;
      // Drizzle wraps the driver error, so the RLS reason lives on `.cause`
      // rather than the top-level message (the same wrapping tenant.repository.ts
      // already has to unwrap for a different error). Asserting rejection plus
      // zero rows written is the meaningful check either way.
      await expect(append(action as AuditAction, 'interactive', marker)).rejects.toBeTruthy();
      expect(await fetch(marker)).toHaveLength(0);
    }
  });

  it.each(UNCONDITIONAL)('%s produces exactly one entry with all six fields', async (action) => {
    const marker = `f-${action}-${Date.now()}`;
    expect(await append(action, 'interactive', marker)).toBe(true);

    const rows = await fetch(marker);
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    expect(row.tenant_id).toBe(tenants.a); // tenant
    expect(row.action).toBe(action); // action
    expect(row.target_entity).toBeTruthy(); // target entity
    expect(row.occurred_at).toBeInstanceOf(Date); // timestamp
    expect(row.source.channel).toBe('interactive'); // source
    expect(row.actor_identity_id).toBe(principal.identityId); // actor
  });

  it.each(UNCONDITIONAL)('%s is emitted even for an automated actor', async (action) => {
    const marker = `u-${action}-${Date.now()}`;
    expect(await append(action, 'automated', marker)).toBe(true);
    expect(await fetch(marker)).toHaveLength(1);
  });

  it.each(GATED)('%s is emitted for an interactive read', async (action) => {
    const marker = `gi-${action}-${Date.now()}`;
    expect(await append(action, 'interactive', marker)).toBe(true);
    expect(await fetch(marker)).toHaveLength(1);
  });

  it.each(GATED)('%s is NOT emitted for an automated read', async (action) => {
    const marker = `ga-${action}-${Date.now()}`;
    expect(await append(action, 'automated', marker)).toBe(false);
    expect(await fetch(marker)).toHaveLength(0);
  });

  it('defaults metadata to {} when the caller omits it entirely', async () => {
    const targetId = `deadbeef-0000-4000-8000-${String(Date.now()).padStart(12, '0').slice(-12)}`;
    await runInTenantContext(principal, async (tx) =>
      appendAuditEntry(tx, {
        tenantId: principal.tenantId,
        action: 'audit.queried',
        targetEntity: 'audit_event',
        targetId,
        actorIdentityId: principal.identityId,
        source: { channel: 'interactive' },
        // metadata deliberately omitted
      }),
    );

    const { rows: written } = await platform.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_event WHERE target_id = $1`,
      [targetId],
    );
    expect(written).toHaveLength(1);
    expect(written[0]!.metadata).toEqual({});
  });
});
