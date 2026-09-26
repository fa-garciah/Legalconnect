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

/**
 * slice 003, backend/drizzle/0030: the same exclusion for the same reason, one
 * slice later and with more at stake. These twelve are reserved to `lc_auth`, and
 * `lc_app`'s audit_event policy refuses them by construction — this sweep writes
 * through the ordinary `lc_app` path, so it is structurally the wrong place to
 * exercise them.
 *
 * That refusal is the point rather than an inconvenience. While the primary factor
 * stays phishable (Constitution, Recognised Technical Debt item 1) this log is the
 * only detection net the product has, so a forged `signin.succeeded` or a
 * suppressed `account.locked` attacks the net itself. `lc_app` not being able to
 * write them is a control, and the fact that these entries appear here as an
 * exclusion list is that control showing up in the tests.
 *
 * Their own coverage is tests/integration/auth-audit-actions.test.ts, which
 * asserts BOTH halves — `lc_app` refused, `lc_auth` admitted with a NULL tenant.
 */
const RESERVED_TO_AUTH_WRITER: readonly string[] = [
  'enrollment.started',
  'enrollment.completed',
  'enrollment.failed',
  'factor.replaced',
  'backup_codes.issued',
  'backup_code.consumed',
  'backup_codes.exhausted',
  'backup_codes.reissued',
  'signin.succeeded',
  'signin.failed',
  'challenge.failed',
  'account.locked',
  // 005-session-lifecycle, backend/drizzle/0042: the same exclusion, one slice
  // later. Reserved to lc_auth by the same policy shape 0030 established, for the
  // same reason — sign-out and step-up verification are exactly the kind of event
  // a forged or suppressed entry would attack. Their own coverage is
  // tests/integration/session-lifecycle-audit-actions.test.ts.
  'session.signed_out',
  'stepup.verified',
  'stepup.failed',
];

const UNCONDITIONAL = AUDIT_ACTIONS.filter(
  (a) =>
    !CHANNEL_GATED_ACTIONS.has(a) &&
    !RESERVED_TO_IDENTITY_WRITER.includes(a) &&
    !RESERVED_TO_AUTH_WRITER.includes(a),
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

  it("covers every action in the vocabulary — fifty-nine (001's seven, 002's nine, 017's three, 006's twelve, 007's eight, 003's twelve, 005's three, 014's one, 013's three, 015's one)", () => {
    // Guards against an action being added to FR-014 / FR-031 / 017-FR-003 / 006-FR-024 /
    // 007-FR-019 / 003-FR-042 / 005 research.md D8 without a test reaching it.
    //
    // 003's twelve and 005's three are counted here but exercised by
    // tests/integration/auth-audit-actions.test.ts and
    // tests/integration/session-lifecycle-audit-actions.test.ts respectively,
    // rather than by this sweep — see RESERVED_TO_AUTH_WRITER above. Counting them
    // here anyway is deliberate: this assertion's job is to notice vocabulary
    // growth, and excluding an action from the count because it is tested
    // elsewhere would defeat that.
    // 014 adds `membership.list_read` (Decision 5), channel-gated like `case.read`.
    // 013 adds three calendar actions, none gated.
    // 015 adds `case.outcome_declared` — unconditional, and NOT gated: declaring how a matter
    // ended is a change to the record, not a read of it, so there is no polling job to throttle.
    expect(AUDIT_ACTIONS).toHaveLength(59);
    // 006/FR-023 adds `case.read` to 001's two. 007/FR-020 adds `document.previewed` and
    // `document.downloaded` to that set. Principle V requires recording ACCESS to cases
    // and documents and not only their modification, and the gate is what keeps a
    // monitoring job from inflating the log it watches.
    expect(GATED).toHaveLength(6);
    expect(RESERVED_TO_IDENTITY_WRITER).toHaveLength(4);
    expect(RESERVED_TO_AUTH_WRITER).toHaveLength(15);
    expect(UNCONDITIONAL).toHaveLength(59 - 6 - 4 - 15);
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
