/**
 * Drizzle schema definitions. data-model.md.
 *
 * The tables themselves are created by the numbered SQL migrations, which also carry
 * the RLS policies and grants those migrations are the only reasonable place for.
 * This file is the typed view of that schema, not its source of truth.
 */
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const planCode = pgEnum('plan_code', ['esencial', 'profesional', 'premium']);
export const tenantStatus = pgEnum('tenant_status', ['active', 'deactivated']);

/**
 * The ten membership-capable archetype codes fixed by Constitution v1.4.0
 * Principle IV. `PO` is deliberately absent — it is not a membership at all,
 * and no column here ever needs to hold it. research.md D9.
 */
export const archetype = pgEnum('archetype', [
  'SA',
  'MP',
  'AA',
  'PL',
  'CM',
  'BM',
  'CC',
  'IC',
  'CB',
  'EL',
]);

export const membershipStatus = pgEnum('membership_status', ['live', 'revoked']);
export const invitationStatus = pgEnum('invitation_status', ['pending', 'accepted', 'revoked']);

export interface PlanLimits {
  readonly users?: number;
  readonly storageBytes?: number;
  readonly monthlyCfdi?: number;
}

export const plan = pgTable('plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: planCode('code').notNull().unique(),
  name: text('name').notNull(),
  limits: jsonb('limits').$type<PlanLimits>().notNull().default({}),
  entitlements: jsonb('entitlements').$type<Record<string, boolean>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenant = pgTable(
  'tenant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    rfc: text('rfc').notNull(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plan.id),
    status: tenantStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (t) => [
    unique('tenant_rfc_unique').on(t.rfc),
    check('tenant_rfc_shape', sql`${t.rfc} ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'`),
  ],
);

/** The `source` of an audit entry. `channel` is load-bearing — FR-025 and FR-026. */
export interface AuditSource {
  readonly channel: 'interactive' | 'automated';
  readonly clientClass?: string;
  readonly networkOrigin?: string;
}

export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').notNull().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    // Nullable: plan.limits_changed belongs to no single tenant (0011_audit_event_tenant_id_nullable.sql).
    tenantId: uuid('tenant_id').references(() => tenant.id),
    action: text('action').notNull(),
    actorIdentityId: uuid('actor_identity_id'),
    actorMembershipId: uuid('actor_membership_id'),
    targetEntity: text('target_entity').notNull(),
    targetId: uuid('target_id'),
    source: jsonb('source').$type<AuditSource>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('audit_event_tenant_time_idx').on(t.tenantId, t.occurredAt)],
);

/**
 * Identity: the person as recognised by the external IdP. Holds no tenant.
 * data-model.md, research.md D4. `lc_app` holds exactly one privilege here —
 * SELECT restricted to its own row — so nothing above this schema can insert or
 * update through it; only `accept_invitation()` (0015) can.
 */
export const identity = pgTable('identity', {
  id: uuid('id').primaryKey().defaultRandom(),
  subject: text('subject').notNull().unique(),
  email: text('email').notNull(),
  mfaEnrolledAt: timestamp('mfa_enrolled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Membership: the access one identity holds within one tenant. Named at slice
 * 001's boundary; built here. Never hard-deleted (FR-009); `lc_app` holds no
 * INSERT grant at all — research.md D1.
 */
export const membership = pgTable(
  'membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identity.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    /** FR-024 (001): the archetype belongs to the membership, not the identity. */
    archetype: archetype('archetype').notNull(),
    status: membershipStatus('status').notNull().default('live'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [unique('membership_identity_tenant_unique').on(t.identityId, t.tenantId)],
);

/**
 * Invitation: a single-use, 7-day grant to become a member of one tenant with
 * one named archetype — issued to one email address, or seeded by the platform
 * context for a tenant with no members yet. `expires_at` is a database-
 * generated column (0014); it is declared here without a default because this
 * file states shape, not the generation expression that the migration owns.
 */
export const invitation = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    targetArchetype: archetype('target_archetype').notNull(),
    invitedEmail: text('invited_email').notNull(),
    /** research.md D2 — the bearer credential is a separate token; only its hash is stored. */
    referenceHash: text('reference_hash').notNull().unique(),
    issuedByMembershipId: uuid('issued_by_membership_id').references(() => membership.id),
    seeded: boolean('seeded').notNull().default(false),
    status: invitationStatus('status').notNull().default('pending'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('invitation_tenant_status_idx').on(t.tenantId, t.status)],
);

export const positionStatus = pgEnum('position_status', ['active', 'retired']);

/**
 * Position: a tenant's own catalog entry for its organizational hierarchy
 * (017/FR-007). Never hard-deleted — retirement is a status change, the same
 * convention 001/002/004 already established for tenants, memberships and
 * invitations (017 research.md, "Retirement, never deletion").
 */
export const position = pgTable(
  'position',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    status: positionStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    // 017 research.md D6 — active names collide case-insensitively per tenant;
    // a retired name is free to reuse.
    uniqueIndex('position_tenant_active_name_unique')
      .on(t.tenantId, sql`lower(trim(${t.name}))`)
      .where(sql`${t.status} = 'active'`),
  ],
);

/**
 * DirectoryEntry: extends exactly one live membership (002) with a position
 * reference, which MAY be unset (017/FR-001, FR-002). Extends membership
 * behind its own seam — a foreign key, never a column added to `membership`
 * itself (017/FR-014). No row exists until a position is first assigned
 * (017 research.md D1); an absent row and one with `positionId: null` both
 * read as "no position assigned."
 */
export const directoryEntry = pgTable('directory_entry', {
  id: uuid('id').primaryKey().defaultRandom(),
  membershipId: uuid('membership_id')
    .notNull()
    .unique()
    .references(() => membership.id),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id),
  positionId: uuid('position_id').references(() => position.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenant.$inferSelect;
export type Plan = typeof plan.$inferSelect;
export type Identity = typeof identity.$inferSelect;
export type Membership = typeof membership.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
export type AuditEvent = typeof auditEvent.$inferSelect;
export type Position = typeof position.$inferSelect;
export type DirectoryEntry = typeof directoryEntry.$inferSelect;
