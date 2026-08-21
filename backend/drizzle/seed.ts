/**
 * Seeds the three iguala tiers, two tenants, and (slice 002) real identity and
 * membership rows replacing the fixtures slice 001 used.
 *
 * Tenant/plan rows run as the PLATFORM role, not as the owner. FORCE ROW LEVEL
 * SECURITY subjects the owner to the policies and the owner has no matching one
 * — and provisioning is a platform operation anyway, so this is semantically
 * right rather than a workaround.
 *
 * Identity and membership rows run as the MIGRATION (superuser) connection.
 * lc_app holds no INSERT grant on either table (research.md D1/D4) and
 * lc_platform's own reach stops at a read-only existence-check (D6), so
 * neither of the two application-facing roles could seed this data even if
 * asked to — which is the point. Seed data is fixture setup, not a simulated
 * user journey, so it is exempt from the same discipline the accept_invitation
 * path exists to enforce for real requests.
 *
 * Two tenants, deliberately: cross-tenant checks need somewhere to reach.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
  }
}

const PLANS = [
  { code: 'esencial', name: 'Esencial', limits: { users: 10, storageBytes: 10 * 2 ** 30, monthlyCfdi: 50 } },
  { code: 'profesional', name: 'Profesional', limits: { users: 25, storageBytes: 100 * 2 ** 30, monthlyCfdi: 250 } },
  { code: 'premium', name: 'Premium', limits: { users: 100, storageBytes: 500 * 2 ** 30, monthlyCfdi: 1000 } },
] as const;

const TENANTS = [
  { name: 'Despacho Alfa, S.C.', rfc: 'DAL091203AB1', plan: 'profesional' },
  { name: 'Bufete Beta, S.C.', rfc: 'BBE150720XY2', plan: 'esencial' },
] as const;

async function main(): Promise<void> {
  loadEnvFile(join(__dirname, '..', '.env'));

  const connectionString = process.env.DATABASE_URL_PLATFORM;
  if (!connectionString) throw new Error('DATABASE_URL_PLATFORM is not set');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const plan of PLANS) {
      await client.query(
        `INSERT INTO plan (code, name, limits, entitlements)
         VALUES ($1, $2, $3::jsonb, '{}'::jsonb)
         ON CONFLICT (code) DO UPDATE SET name = excluded.name, limits = excluded.limits`,
        [plan.code, plan.name, JSON.stringify(plan.limits)],
      );
    }
    console.log(`seeded ${PLANS.length} plans`);

    const tenantIds: string[] = [];
    for (const tenant of TENANTS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO tenant (name, rfc, plan_id)
         VALUES ($1, $2, (SELECT id FROM plan WHERE code = $3))
         ON CONFLICT (rfc) DO UPDATE SET name = excluded.name
         RETURNING id`,
        [tenant.name, tenant.rfc, tenant.plan],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error(`failed to seed tenant ${tenant.rfc}`);
      tenantIds.push(id);
      console.log(`seeded tenant ${tenant.rfc} -> ${id}`);
    }

    // One audit entry per tenant so isolation reads have something to distinguish.
    for (const tenantId of tenantIds) {
      await client.query(
        `INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source)
         VALUES ($1, 'tenant.provisioned', 'tenant', $1, '{"channel":"interactive"}'::jsonb)`,
        [tenantId],
      );
    }
    console.log(`seeded ${tenantIds.length} audit entries`);

    console.log('\nSEED_TENANT_A=' + tenantIds[0]);
    console.log('SEED_TENANT_B=' + tenantIds[1]);

    await seedIdentitiesAndMemberships(tenantIds[0]!, tenantIds[1]!);
  } finally {
    await client.end();
  }
}

/**
 * research.md D1/D4: neither lc_app nor lc_platform can insert identity or
 * membership rows, so this runs on the migration (superuser) connection —
 * fixture setup, exempt from the discipline that path enforces for real
 * requests.
 */
async function seedIdentitiesAndMemberships(tenantA: string, tenantB: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL_MIGRATION;
  if (!connectionString) throw new Error('DATABASE_URL_MIGRATION is not set');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // The reason FR-023 (001) is testable at all: one person, two tenants, two
    // different archetypes, per FR-024. mfa_enrolled_at is set at seed time —
    // these fixtures represent already-onboarded people for ISOLATION testing
    // (SC-001's re-run bar), not for exercising FR-026's MFA gate, which has
    // its own purpose-built unenrolled identity in mfa-gate.test.ts.
    const dual = await client.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at)
       VALUES ('idp|dual-tenant-counsel', 'dual@example.com', now())
       ON CONFLICT (subject) DO UPDATE SET email = excluded.email, mfa_enrolled_at = excluded.mfa_enrolled_at
       RETURNING id`,
    );
    const dualId = dual.rows[0]!.id;

    const outsider = await client.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at)
       VALUES ('idp|no-membership', 'outsider@example.com', now())
       ON CONFLICT (subject) DO UPDATE SET email = excluded.email, mfa_enrolled_at = excluded.mfa_enrolled_at
       RETURNING id`,
    );
    console.log(`seeded identity outsider -> ${outsider.rows[0]!.id}`);

    const membershipA = await client.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype)
       VALUES ($1, $2, 'MP')
       ON CONFLICT (identity_id, tenant_id) DO UPDATE SET archetype = excluded.archetype
       RETURNING id`,
      [dualId, tenantA],
    );
    const membershipB = await client.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype)
       VALUES ($1, $2, 'IC')
       ON CONFLICT (identity_id, tenant_id) DO UPDATE SET archetype = excluded.archetype
       RETURNING id`,
      [dualId, tenantB],
    );
    console.log(`seeded identity dual -> ${dualId} (membership A ${membershipA.rows[0]!.id}, membership B ${membershipB.rows[0]!.id})`);

    // One pending invitation per tenant, so accept-flow tests have something to
    // consume without issuing one first (quickstart.md Setup).
    for (const [tenantId, membershipId, email] of [
      [tenantA, membershipA.rows[0]!.id, 'pending-invitee-a@example.com'],
      [tenantB, membershipB.rows[0]!.id, 'pending-invitee-b@example.com'],
    ] as const) {
      await client.query(
        `INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded)
         VALUES ($1, 'AA', $2, $3, $4, false)
         ON CONFLICT (reference_hash) DO NOTHING`,
        [tenantId, email, `seed-reference-${tenantId}`, membershipId],
      );
    }
    console.log('seeded 2 pending invitations');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
