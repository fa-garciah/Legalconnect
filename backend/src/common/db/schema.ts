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
  date,
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

/* -------------------------------------------------------------------------
 * 006-client-case-core. Six tables, four enums. data-model.md.
 * ---------------------------------------------------------------------- */

export const clientKind = pgEnum('client_kind', ['organization', 'person']);
export const clientStatus = pgEnum('client_status', ['active', 'inactive']);
export const caseRole = pgEnum('case_role', ['lead', 'collaborator', 'support']);
export const catalogEntryStatus = pgEnum('catalog_entry_status', ['active', 'retired']);

/**
 * CaseStatus: a tenant's own vocabulary for where a matter stands (FR-019).
 *
 * `isClosing` is the one field any catalog entry carries beyond name and status, and the
 * one field editable after creation (FR-008a). It is the firm's declaration that a case
 * holding this status is closed — the product cannot infer that from a name it did not
 * choose, since the catalog is per tenant (Principle III). A tenant may mark several
 * statuses closing, or none.
 */
export const caseStatus = pgTable(
  'case_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    isClosing: boolean('is_closing').notNull().default(false),
    status: catalogEntryStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('case_status_tenant_active_name_unique')
      .on(t.tenantId, sql`lower(trim(${t.name}))`)
      .where(sql`${t.status} = 'active'`),
  ],
);

/** MatterType: a tenant's own practice-area vocabulary. Optional on a case (FR-005). */
export const matterType = pgTable(
  'matter_type',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    status: catalogEntryStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('matter_type_tenant_active_name_unique')
      .on(t.tenantId, sql`lower(trim(${t.name}))`)
      .where(sql`${t.status} = 'active'`),
  ],
);

/**
 * Venue: a tenant's own courts. Optional on a case — a consultative matter has none.
 * Seeded empty, deliberately (research.md D7): a firm's venues depend on its
 * jurisdiction, and any list shipped here would be wrong for most firms.
 */
export const venue = pgTable(
  'venue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    status: catalogEntryStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('venue_tenant_active_name_unique')
      .on(t.tenantId, sql`lower(trim(${t.name}))`)
      .where(sql`${t.status} = 'active'`),
  ],
);

/**
 * Client: a party the firm represents (FR-001 to FR-004a).
 *
 * `rfc` is nullable by requirement — fiscal completeness is a billing concern, and
 * refusing intake over an uncollected RFC would block a workflow this slice does not own.
 * Never hard-deleted; withdrawal is a status change and it is reversible (FR-004a).
 *
 * No uniqueness on `legalName`: two different people called Juan Pérez at one firm is not
 * a data error. Only cross-tenant distinctness is required, and `tenantId` delivers it.
 */
export const client = pgTable(
  'client',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    kind: clientKind('kind').notNull(),
    legalName: text('legal_name').notNull(),
    rfc: text('rfc'),
    status: clientStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (t) => [
    // FR-002a — backs the case-insensitive name filter on the list read.
    index('client_tenant_legal_name_lower').on(t.tenantId, sql`lower(${t.legalName})`),
    check(
      'client_deactivated_at_consistent',
      sql`(${t.status} = 'inactive' AND ${t.deactivatedAt} IS NOT NULL)
          OR (${t.status} = 'active' AND ${t.deactivatedAt} IS NULL)`,
    ),
  ],
);

/**
 * Case — the relation is `case_file` because `CASE` is a PostgreSQL reserved word
 * (research.md D4). The entity, the API path and this type all say "case"; only the
 * table is renamed, and it maps onto *expediente* and onto `fileNumber` below.
 *
 * `fileNumber` is the firm's own and `venueCaseReference` is the court's — two distinct
 * fields (FR-006), which is what the prototype's single field could not express.
 *
 * `closedOn` is DERIVED from the target status's `isClosing` (FR-008a) and is never
 * accepted as request input. The status change is the only place it moves.
 */
export const caseFile = pgTable(
  'case_file',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    clientId: uuid('client_id')
      .notNull()
      .references(() => client.id),
    fileNumber: text('file_number').notNull(),
    venueCaseReference: text('venue_case_reference'),
    caseStatusId: uuid('case_status_id')
      .notNull()
      .references(() => caseStatus.id),
    matterTypeId: uuid('matter_type_id').references(() => matterType.id),
    venueId: uuid('venue_id').references(() => venue.id),
    openedOn: date('opened_on').notNull().default(sql`current_date`),
    closedOn: date('closed_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // FR-007. Not partial, unlike the catalogs' active-name indexes: a closed matter's
    // number stays taken, because reusing it would corrupt the firm's own records.
    uniqueIndex('case_file_tenant_file_number_unique').on(
      t.tenantId,
      sql`lower(trim(${t.fileNumber}))`,
    ),
  ],
);

/**
 * CaseAssignment: one membership's place on one case (FR-009 to FR-012a).
 *
 * This is the table the `assigned` scope resolver reads, and the reason it can answer
 * without a cache — the query runs inside the request's own transaction, so there is
 * nothing to invalidate when an assignment ends (FR-011).
 *
 * References a MEMBERSHIP, never an identity: the same person at two firms holds two
 * unrelated sets of assignments (FR-010, 017/FR-001's precedent).
 *
 * `tenantId` is denormalised rather than reached through `caseFile`, so the RLS policy
 * needs no join on the authorization hot path.
 */
export const caseAssignment = pgTable(
  'case_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => caseFile.id),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => membership.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    roleOnCase: caseRole('role_on_case').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    unassignedAt: timestamp('unassigned_at', { withTimezone: true }),
  },
  (t) => [
    // One LIVE assignment per pair; history stays reusable. Makes "assigned twice" a
    // database refusal rather than a race two concurrent callers could both win
    // (research.md D5 — 017's active-name index applied to a different pair).
    uniqueIndex('case_assignment_live_unique')
      .on(t.caseId, t.membershipId)
      .where(sql`${t.unassignedAt} IS NULL`),
    // Backs the list read's filter — "which cases is this membership on". The unique
    // index above backs the resolver, which asks the reverse.
    index('case_assignment_membership_live')
      .on(t.membershipId)
      .where(sql`${t.unassignedAt} IS NULL`),
  ],
);

export type Tenant = typeof tenant.$inferSelect;
export type Plan = typeof plan.$inferSelect;
export type Identity = typeof identity.$inferSelect;
export type Membership = typeof membership.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
export type AuditEvent = typeof auditEvent.$inferSelect;
export type Client = typeof client.$inferSelect;
export type CaseFile = typeof caseFile.$inferSelect;
export type CaseAssignment = typeof caseAssignment.$inferSelect;
export type CaseStatus = typeof caseStatus.$inferSelect;
export type MatterType = typeof matterType.$inferSelect;
export type Venue = typeof venue.$inferSelect;
export type Position = typeof position.$inferSelect;
export type DirectoryEntry = typeof directoryEntry.$inferSelect;
