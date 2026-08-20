/**
 * The Drizzle client bound to the PLATFORM ADMINISTRATION role (research.md D9).
 *
 * A second role on a second connection, deliberately not a bypass flag inside the
 * tenant path — that would put a "disable isolation" switch on the route every
 * business request travels, where any future endpoint could find it.
 *
 * Its reach is narrowed at the database: policies and grants let it touch tenant,
 * plan and audit_event and nothing else. No business table, so no case file is
 * reachable across tenants.
 *
 * There is no tenant-context helper here on purpose. Activating a tenant is the other
 * client's job; this one is cross-tenant by design and has no tenant to set.
 */
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type PlatformDb = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let db: PlatformDb | undefined;

export function platformDb(): PlatformDb {
  if (db) return db;
  const connectionString = process.env.DATABASE_URL_PLATFORM;
  if (!connectionString) throw new Error('DATABASE_URL_PLATFORM is not set');
  pool = new Pool({ connectionString, max: 4 });
  db = drizzle(pool, { schema });
  return db;
}

export async function closePlatformDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
