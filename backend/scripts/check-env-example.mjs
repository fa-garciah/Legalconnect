#!/usr/bin/env node
/**
 * Fails when `.env.example` and the environment disagree about which keys exist.
 *
 * **Why this is a gate and not a lint rule.** Three separate multi-hour debugging
 * sessions in this repository have had the same root cause: a key present in
 * `.env.example` and absent from the environment actually running. The failures never
 * look like configuration —
 *
 *   - missing `OBJECT_STORE_*` made every test that boots `AppModule` die with
 *     `Worker exited unexpectedly`, cause swallowed, across every slice;
 *   - missing `INVITATION_ISSUANCE_RATE_PER_HOUR` silently applied a default of 50/hour
 *     and failed five of 002's own tests with `429` on any second run within the hour;
 *   - the same class of drift is what `docker-compose.yml`'s missing bucket did to 007.
 *
 * Each cost far more than this file. `.env.example` is the contract; this checks it is
 * honoured.
 *
 * Two directions, both checked:
 *   - **missing**: in `.env.example`, not in the environment → defaults apply silently.
 *   - **undocumented**: read by `src/**` via `process.env`, in neither → a value nobody
 *     can discover they need.
 *
 * Locally it reads `backend/.env`. In CI there is no `.env` file, so it reads
 * `process.env` — which is why the workflow must set every key `.env.example` declares.
 * That is the point: CI proves the documented set is sufficient to run the application.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';

const backend = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Keys only — never values. This script must never print or compare a secret. */
function keysOf(text) {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.slice(0, line.indexOf('=')).trim())
      .filter(Boolean),
  );
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
}

const examplePath = join(backend, '.env.example');
if (!existsSync(examplePath)) {
  console.error('.env.example is missing — it is the contract this check enforces.');
  process.exit(1);
}

const documented = keysOf(readFileSync(examplePath, 'utf8'));

// Locally, the file the application actually loads. In CI, the real environment.
const envPath = join(backend, '.env');
const present = existsSync(envPath)
  ? keysOf(readFileSync(envPath, 'utf8'))
  : new Set(Object.keys(process.env));
const source = existsSync(envPath) ? 'backend/.env' : 'process.env (no .env file — CI)';

// Every `process.env.X` the source tree reads.
const used = new Set();
for (const file of walk(join(backend, 'src'))) {
  for (const match of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    used.add(match[1]);
  }
}

// NODE_ENV and friends come from the runtime, not from this project's own config.
const RUNTIME_PROVIDED = new Set(['NODE_ENV', 'PORT', 'CI', 'TZ']);

const missing = [...documented].filter((key) => !present.has(key)).sort();
const undocumented = [...used]
  .filter((key) => !documented.has(key) && !RUNTIME_PROVIDED.has(key))
  .sort();

let failed = false;

if (missing.length > 0) {
  failed = true;
  console.error(`\n✖ Declared in .env.example, absent from ${source}:\n`);
  for (const key of missing) console.error(`    ${key}`);
  console.error(
    '\n  These fall back to code defaults silently. Copy them across:\n' +
      '    grep -E "^(' + missing.join('|') + ')=" backend/.env.example >> backend/.env\n',
  );
}

if (undocumented.length > 0) {
  failed = true;
  console.error('\n✖ Read by src/** and documented nowhere:\n');
  for (const key of undocumented) console.error(`    ${key}`);
  console.error('\n  Add each to .env.example with a comment saying what it is for.\n');
}

if (failed) process.exit(1);

console.log(
  `✓ .env.example and ${source} agree — ${documented.size} keys documented, ` +
    `${used.size} read by src/**, 0 undocumented.`,
);
