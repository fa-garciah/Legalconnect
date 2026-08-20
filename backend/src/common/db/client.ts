/**
 * The Drizzle client bound to the APPLICATION role.
 *
 * The tenant setting is applied with `set_config(..., true)` rather than the literal
 * `SET LOCAL`, because utility statements take no bind parameters and building the
 * statement by string concatenation would put a request value into SQL text. Both are
 * transaction-scoped, which is the property that matters: the setting dies with the
 * transaction and cannot leak into a neighbouring request through the pool. That is
 * precisely why the constitution mandates Drizzle or plain `pg` and prohibits Prisma.
 */
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

let pool: Pool | undefined;
let db: Db | undefined;

export function appDb(): Db {
  if (db) return db;
  const connectionString = process.env.DATABASE_URL_APP;
  if (!connectionString) throw new Error('DATABASE_URL_APP is not set');
  pool = new Pool({ connectionString, max: 10 });
  db = drizzle(pool, { schema });
  return db;
}

export async function closeAppDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}

/**
 * Opens a transaction with exactly one tenant activated for its whole duration
 * (FR-022). Every business query runs inside this, and none of them filters tenant by
 * hand — that is the data layer's job.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return appDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Asserts the attributes that decide whether isolation exists at all.
 *
 * This is not defensive padding. PostgreSQL silently ignores RLS for superusers and
 * for the table owner, so connecting with the wrong role leaves every policy written,
 * the isolation absent, and the test suite green. The constitution names this failure
 * mode explicitly, which is why it is checked at startup rather than trusted from
 * configuration.
 */
export async function assertApplicationRoleIsSafe(): Promise<void> {
  const result = await appDb().execute<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    owned: string;
  }>(sql`
    SELECT r.rolsuper,
           r.rolbypassrls,
           (SELECT count(*)::text FROM pg_class c
             WHERE c.relowner = r.oid AND c.relkind IN ('r','p')) AS owned
      FROM pg_roles r
     WHERE r.rolname = current_user
  `);

  const row = result.rows[0];
  if (!row) throw new Error('could not read the connected role');

  const problems: string[] = [];
  if (row.rolsuper) problems.push('the role is a SUPERUSER');
  if (row.rolbypassrls) problems.push('the role holds BYPASSRLS');
  if (row.owned !== '0') problems.push(`the role owns ${row.owned} table(s)`);

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: RLS would be silently ineffective because ${problems.join(', ')}. ` +
        'Connect as a role that owns nothing, is not superuser, and lacks BYPASSRLS.',
    );
  }
}
