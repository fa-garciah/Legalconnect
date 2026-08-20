/**
 * Seeds the three iguala tiers and two tenants.
 *
 * Runs as the PLATFORM role, not as the owner. FORCE ROW LEVEL SECURITY subjects the
 * owner to the policies and the owner has no matching one — and provisioning is a
 * platform operation anyway, so this is semantically right rather than a workaround.
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
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
