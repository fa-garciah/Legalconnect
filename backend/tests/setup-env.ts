/**
 * Loads .env for every test file, before any of them import a client.
 *
 * Previously each test picked up the environment as a side effect of importing the db
 * helper. A test that did not happen to need that helper — provision-validation, which
 * only drives HTTP — got no environment, and the platform client threw on connect. The
 * symptom was a uniform 500 that looked like a controller bug.
 *
 * Environment loading is infrastructure, not something individual tests should carry by
 * import order.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(__dirname, '..', '.env');

if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
  }
}

/**
 * Tests use the same AWS bucket as the app unless `OBJECT_STORE_TEST_BUCKET` names another one.
 * Sharing it is safe for the app's data: every test firm is a fresh tenant with its own random
 * id, and every object key starts with `tenant/{that id}/`, so a test can neither overwrite nor
 * read a real firm's documents. It does leave test objects behind; a dedicated bucket avoids that.
 */
if (process.env.OBJECT_STORE_TEST_BUCKET) {
  process.env.OBJECT_STORE_BUCKET = process.env.OBJECT_STORE_TEST_BUCKET;
}

for (const required of [
  'DATABASE_URL_MIGRATION',
  'DATABASE_URL_APP',
  'DATABASE_URL_PLATFORM',
]) {
  if (!process.env[required]) {
    throw new Error(
      `${required} is not set. Copy .env.example to .env, then run npm run db:up && npm run db:migrate && npm run db:seed.`,
    );
  }
}
