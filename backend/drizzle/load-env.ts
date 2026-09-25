/**
 * T007 — the one `.env` reader for everything under `drizzle/`. 022/FR-015.
 *
 * This function existed four times before this slice: in `migrate.ts`, in `seed.ts`, in
 * `scripts/demo-invitation.ts` and in `tests/setup-env.ts`. Four copies of eleven lines is
 * survivable right up until they disagree — and they already nearly do, since the test
 * copy also installs object-store defaults while the others do not.
 *
 * This slice collapses the three under `drizzle/` (`migrate.ts`, `seed.ts`, `seed-demo.ts`).
 * `tests/setup-env.ts` keeps its own, deliberately: it has extra behaviour that belongs to
 * the test runner rather than to seeding, and moving it would put test policy in a
 * production-adjacent file.
 *
 * Deliberately NOT `dotenv`: the manifest is pinned and audited
 * (`no-new-dependency.test.ts`), and this is eleven lines.
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * Reads `path` into `process.env`, leaving any key that is ALREADY SET untouched — so a
 * value exported in the shell, or set by CI, always wins over the file. An absent file is a
 * no-op rather than an error, because a developer running against exported variables has no
 * `.env` and is not doing anything wrong.
 */
export function loadEnvFile(path: string): void {
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
