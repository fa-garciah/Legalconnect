/**
 * Drizzle schema definitions. data-model.md.
 *
 * The tables themselves are created by the numbered SQL migrations, which also carry
 * the RLS policies and grants those migrations are the only reasonable place for.
 * This file is the typed view of that schema, not its source of truth.
 */
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const planCode = pgEnum('plan_code', ['esencial', 'profesional', 'premium']);
export const tenantStatus = pgEnum('tenant_status', ['active', 'deactivated']);

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

export type Tenant = typeof tenant.$inferSelect;
export type Plan = typeof plan.$inferSelect;
export type AuditEvent = typeof auditEvent.$inferSelect;
