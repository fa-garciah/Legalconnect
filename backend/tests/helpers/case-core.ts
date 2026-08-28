/**
 * Shared fixtures for 006-client-case-core's suites.
 *
 * Every suite that writes provisions its OWN firms rather than touching the two `db:seed`
 * tenants — 017's `position-catalog.test.ts` established this, and the reason applies here
 * too: `directory-seed.test.ts` asserts the seeded tenants hold exactly the default
 * catalog, and a contract test that added a row would break it on the next run without
 * re-seeding.
 *
 * Members are created on the MIGRATION connection because `lc_app` holds no INSERT on
 * `membership` (002/research.md D1) — fixture setup, not a simulated user journey.
 */
import type { Client } from 'pg';

export interface Actor {
  readonly identityId: string;
  readonly membershipId: string;
}

export interface CaseFirm {
  readonly tenantId: string;
  /** Satisfies the `assigned` resolver unconditionally (Decision 2). */
  readonly mp: Actor;
  readonly sa: Actor;
  /** Genuinely scope-restricted — the archetypes the ethical wall still holds against. */
  readonly aa: Actor;
  readonly pl: Actor;
  readonly cm: Actor;
  readonly bm: Actor;
  readonly statusOpenId: string;
  readonly statusClosingId: string;
  readonly matterTypeId: string;
}

let counter = 0;
export const nextSuffix = (): string => `${Date.now()}-${(counter += 1)}`;
export const uniqueName = (stem: string): string => `${stem} ${nextSuffix()}`;

export async function makeMember(
  migration: Client,
  tenantId: string,
  archetype: string,
): Promise<Actor> {
  const suffix = nextSuffix();
  const identity = await migration.query<{ id: string }>(
    `INSERT INTO identity (subject, email, mfa_enrolled_at)
     VALUES ($1, $2, now()) RETURNING id`,
    [`idp|cc-${suffix}`, `cc-${suffix}@example.com`],
  );
  const identityId = identity.rows[0]!.id;
  const membership = await migration.query<{ id: string }>(
    `INSERT INTO membership (identity_id, tenant_id, archetype)
     VALUES ($1, $2, $3) RETURNING id`,
    [identityId, tenantId, archetype],
  );
  return { identityId, membershipId: membership.rows[0]!.id };
}

/**
 * A tenant with the same catalogs provisioning gives every real firm, plus one member of
 * each internal archetype.
 *
 * The two case statuses are deliberately asymmetric: one ordinary and one marked
 * `is_closing`, so FR-008a's derivation has both directions available without any suite
 * having to build them first.
 */
export async function makeCaseFirm(migration: Client, label: string, rfc: string): Promise<CaseFirm> {
  const tenant = await migration.query<{ id: string }>(
    `INSERT INTO tenant (name, rfc, plan_id)
     VALUES ($1, $2, (SELECT id FROM plan WHERE code = 'esencial'))
     RETURNING id`,
    [`${label}, S.C.`, rfc],
  );
  const tenantId = tenant.rows[0]!.id;

  const statusOpen = await migration.query<{ id: string }>(
    `INSERT INTO case_status (tenant_id, name, is_closing) VALUES ($1, 'En Proceso', false) RETURNING id`,
    [tenantId],
  );
  const statusClosing = await migration.query<{ id: string }>(
    `INSERT INTO case_status (tenant_id, name, is_closing) VALUES ($1, 'Concluido', true) RETURNING id`,
    [tenantId],
  );
  const matterType = await migration.query<{ id: string }>(
    `INSERT INTO matter_type (tenant_id, name) VALUES ($1, 'Mercantil') RETURNING id`,
    [tenantId],
  );

  return {
    tenantId,
    mp: await makeMember(migration, tenantId, 'MP'),
    sa: await makeMember(migration, tenantId, 'SA'),
    aa: await makeMember(migration, tenantId, 'AA'),
    pl: await makeMember(migration, tenantId, 'PL'),
    cm: await makeMember(migration, tenantId, 'CM'),
    bm: await makeMember(migration, tenantId, 'BM'),
    statusOpenId: statusOpen.rows[0]!.id,
    statusClosingId: statusClosing.rows[0]!.id,
    matterTypeId: matterType.rows[0]!.id,
  };
}
