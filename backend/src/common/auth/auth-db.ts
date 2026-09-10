/**
 * The Drizzle client bound to the `lc_auth` role. tasks.md T000.
 *
 * A FIFTH CONNECTION, and the reason is a hard constraint rather than tidiness.
 * `lc_app` holds no privilege at all on `identity_credential`, `identity_factor`
 * or `backup_code` — not a narrowed grant, none — so the connection every other
 * module uses genuinely cannot reach authentication material. That is a data-layer
 * guarantee, which is what Principle II asks for everywhere else and what
 * auth-grants-lockdown.test.ts proves as `permission denied` rather than as an
 * empty result.
 *
 * The material still has to reach the application, because Argon2id digests are
 * salted, the TOTP envelope key is deliberately not in the database, and neither
 * primitive exists inside PostgreSQL. So the only real question was WHICH
 * CONNECTION receives it. It is this one.
 *
 * IMPORTED BY `src/modules/auth/` AND BY NOTHING ELSE. A module that imports this
 * is claiming to be part of the authentication layer, and that claim should be
 * visible in review.
 */
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type AuthDb = NodePgDatabase<typeof schema>;
export type AuthTx = Parameters<Parameters<AuthDb['transaction']>[0]>[0];

let pool: Pool | undefined;
let db: AuthDb | undefined;

export function authDb(): AuthDb {
  if (db) return db;
  const connectionString = process.env.DATABASE_URL_AUTH;
  if (!connectionString) throw new Error('DATABASE_URL_AUTH is not set');
  // A smaller pool than the application's: authentication is a small fraction of
  // request volume, and every connection here can reach material no other
  // connection can, so the number of them is worth keeping visible and low.
  pool = new Pool({ connectionString, max: 5 });
  db = drizzle(pool, { schema });
  return db;
}

export async function closeAuthDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}

/**
 * No tenant context is set here, and that is not an omission.
 *
 * Authentication happens BEFORE tenant selection: at the moment a credential is
 * verified there is no tenant, and none of the five tables this connection reaches
 * carries a `tenant_id` to scope by. `app.identity_id` is likewise not set, because
 * establishing WHO the caller is is precisely what these transactions do.
 */
export async function withAuthTransaction<T>(fn: (tx: AuthTx) => Promise<T>): Promise<T> {
  return authDb().transaction(fn);
}
