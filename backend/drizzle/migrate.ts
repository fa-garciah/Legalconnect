/**
 * Applies the numbered .sql migrations in order, as the migration/owner role.
 *
 * Two things this deliberately does NOT do:
 *  - It never sets a role password from a committed file. Constitution Principle VI:
 *    secrets never in the repository. Passwords come from the environment here.
 *  - It never seeds data. Seeding runs as the platform role (see seed.ts), because
 *    FORCE ROW LEVEL SECURITY subjects the owner to the policies and the owner has no
 *    matching one. Provisioning is a platform operation anyway.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/** Minimal .env reader — avoids a dependency for something this small. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const quoteLiteral = (s: string): string => `'${s.replace(/'/g, "''")}'`;

const ROLE_PASSWORD_ENV: ReadonlyArray<readonly [string, string]> = [
  ['lc_app', 'LC_APP_PASSWORD'],
  ['lc_platform', 'LC_PLATFORM_PASSWORD'],
  ['lc_retention', 'LC_RETENTION_PASSWORD'],
];

async function main(): Promise<void> {
  loadEnvFile(join(__dirname, '..', '.env'));

  const connectionString = process.env.DATABASE_URL_MIGRATION;
  if (!connectionString) {
    throw new Error('DATABASE_URL_MIGRATION is not set (see .env.example)');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(__dirname))
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .sort();

    if (files.length === 0) throw new Error('no migration files found');

    for (const file of files) {
      const seen = await client.query('SELECT 1 FROM schema_migration WHERE filename = $1', [file]);
      if (seen.rowCount && seen.rowCount > 0) {
        console.log(`skip     ${file}`);
        continue;
      }

      const sql = await readFile(join(__dirname, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`applied  ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${(error as Error).message}`);
      }
    }

    // Utility statements take no bind parameters, so the value is quoted rather than
    // parameterised. Role names are compile-time constants above, not input.
    for (const [role, envVar] of ROLE_PASSWORD_ENV) {
      const password = process.env[envVar];
      if (!password) {
        console.warn(`warn     ${envVar} unset — leaving ${role} password unchanged`);
        continue;
      }
      await client.query(`ALTER ROLE ${role} PASSWORD ${quoteLiteral(password)}`);
      console.log(`password ${role}`);
    }

    // Report the attributes that decide whether isolation is real at all
    // (research.md D4). The startup assertion in src/main.ts enforces them; this is
    // an early warning at migration time.
    const attrs = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      owned: string;
    }>(
      `SELECT r.rolname, r.rolsuper, r.rolbypassrls,
              (SELECT count(*)::text FROM pg_class c
                WHERE c.relowner = r.oid AND c.relkind IN ('r','p')) AS owned
         FROM pg_roles r
        WHERE r.rolname = ANY($1::text[])
        ORDER BY r.rolname`,
      [['lc_app', 'lc_platform', 'lc_audit_writer', 'lc_retention']],
    );
    console.log('\nrole                superuser  bypassrls  tables owned');
    for (const row of attrs.rows) {
      console.log(
        `${row.rolname.padEnd(20)}${String(row.rolsuper).padEnd(11)}${String(
          row.rolbypassrls,
        ).padEnd(11)}${row.owned}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
