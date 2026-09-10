/**
 * Connection helpers, one per database role.
 *
 * Tests connect as the ACTUAL application role, not as the owner and not through a
 * mock. RLS is silently ignored for owners and superusers, so a test that connects as
 * either passes while proving nothing — the specific failure mode the constitution
 * calls out by name.
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

loadEnvFile(join(__dirname, '..', '..', '.env'));

export type Role = 'app' | 'platform' | 'migration' | 'retention' | 'auth';

const ENV_BY_ROLE: Record<Role, string> = {
  app: 'DATABASE_URL_APP',
  platform: 'DATABASE_URL_PLATFORM',
  migration: 'DATABASE_URL_MIGRATION',
  retention: 'DATABASE_URL_RETENTION',
  // 003's fifth role. Present here for the same reason the other four are: the
  // lockdown suite must connect as the REAL role to prove anything. Asking the owner
  // whether `lc_app` can read `identity_factor` gets a useless answer — the owner can
  // read everything. `auth-grants-lockdown.test.ts` connects as `app` and expects
  // permission denied, and as `auth` and expects success; neither assertion means
  // anything if either connects as the migration role.
  auth: 'DATABASE_URL_AUTH',
};

export async function connectAs(role: Role): Promise<Client> {
  const envVar = ENV_BY_ROLE[role];
  const connectionString = process.env[envVar];
  if (!connectionString) throw new Error(`${envVar} is not set`);
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

/**
 * Runs `fn` inside a transaction with exactly one tenant activated, mirroring what
 * the production middleware does (research.md D3). `SET LOCAL` dies with the
 * transaction, so it cannot leak into a neighbouring test through the pool.
 */
export async function withTenant<T>(
  client: Client,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Runs `fn` inside a transaction with NO tenant activated. This is the case
 * Constitution v1.3.0 requires covered for every tenant-scoped table.
 */
export async function withoutTenant<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
