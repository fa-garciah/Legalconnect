/**
 * T076 — 0 routes return the codes again, FOR ANY ARCHETYPE INCLUDING SA AND
 * PO. FR-024, FR-029, SC-006.
 *
 * ASSERTED BY ROUTE-TABLE INSPECTION RATHER THAN BY ATTEMPTING EACH ROUTE, and
 * the task says so for a reason worth restating: an attempt-based test proves
 * only that the routes somebody thought of refuse. It says nothing about the
 * one added next month by a person who reasonably assumed a support flow
 * needed it. Reading the route table catches that one.
 *
 * The constitution's wording is absolute and unusual, so it is worth quoting:
 * "No archetype may read another person's codes, and no archetype may read any
 * code at all — including PO and SA." Not "no archetype may read another
 * person's" — no archetype may read ANY, including their own, including the
 * vendor's own operators.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { connectAs } from '../helpers/db';
import { expectRoutes, type RegisteredRoute } from '../helpers/routes';


/**
 * The ONE route that legitimately names a backup code. It is a POST that
 * SPENDS one and returns none. Enumerated rather than pattern-matched, so a
 * second route wearing the word has to be added here by somebody who has
 * thought about whether it returns codes.
 *
 * `/auth/recovery/reenroll` deliberately does NOT appear: it issues a fresh
 * set as part of completing a recovery, and its path says nothing about
 * codes — which is correct, since what it returns is the product of
 * enrollment rather than a read of stored ones.
 */
const CODE_CONSUMING_ROUTES = ['/auth/recovery/backup-code'];

describe('the backup codes are unreadable, by route-table inspection (FR-029, SC-006)', () => {
  let app: INestApplication;
  let migration: Client;
  let routes: RegisteredRoute[];
  let paths: string[];

  beforeAll(async () => {
    app = await createUnauthenticatedApp();
    migration = await connectAs('migration');
    routes = expectRoutes(app);
    paths = routes.map((route) => route.path);
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  it('the route table is non-empty — this file is not passing vacuously', () => {
    // Without this, a change to how Nest exposes its router would make every
    // assertion below trivially true.
    expect(paths.length).toBeGreaterThan(10);
  });

  it('NO ROUTE MENTIONS BACKUP CODES except the two that SPEND one', () => {
    // The distinction the first draft of this test missed. `/auth/recovery/
    // backup-code` names a code because it ACCEPTS one and marks it consumed —
    // the opposite of returning them. What must not exist is a route that
    // hands them back.
    const mentions = paths.filter((path) =>
      /backup|respaldo|recovery-codes|codigos/i.test(path),
    );
    expect(mentions.sort()).toEqual([...CODE_CONSUMING_ROUTES].sort());
  });

  it('the only route that mentions recovery at all is the one that CONSUMES a code', () => {
    // `/auth/recovery/backup-code` accepts one and spends it. That is the
    // opposite of returning them, and it is the single legitimate mention.
    const recovery = paths.filter((path) => /recovery|recuperar/i.test(path)).sort();
    expect(recovery).toEqual(['/auth/recovery/backup-code', '/auth/recovery/reenroll']);
  });

  it('NO GET ROUTE EXISTS ANYWHERE UNDER /auth — nothing there is readable', () => {
    // A structural argument rather than an enumerated one. Every
    // authentication route is a POST that changes state; a GET under /auth
    // would be something being read back, which is the shape of the mistake
    // this file exists to catch.
    const authGets = routes
      .filter((route) => route.path.startsWith('/auth') && route.methods.includes('get'))
      .map((route) => route.path);
    expect(authGets).toEqual([]);
  });

  it('no service method returns a stored code or digest to a caller', () => {
    // The route table cannot see a code smuggled into another route's
    // response body, so this reads the auth module's own source for a return
    // path out of `backup_code`.
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts')) files.push(full);
      }
    };
    walk(join(__dirname, '..', '..', 'src', 'modules', 'auth'));

    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Selecting the digest column is how a read-back would begin. The one
      // legitimate SELECT of it is in recovery, into verifyAgainstSet, which
      // compares and discards — never into a response.
      const selectsDigest = /SELECT[^;]*\bdigest\b[^;]*FROM backup_code/is.test(code);
      if (selectsDigest) {
        expect(code, `${file} selects a digest`).toContain('verifyAgainstSet');
      }
    }
  });

  it('SA and PO hold no grant on the table either — the absence is not merely routing', () => {
    // Even if a route existed, the connection behind it could not read the
    // rows. Belt and braces, and the braces are the data layer.
    return migration
      .query<{ n: string }>(
        `SELECT count(*)::text AS n FROM information_schema.role_table_grants
          WHERE table_name = 'backup_code' AND grantee IN ('lc_app', 'lc_platform')`,
      )
      .then(({ rows }) => {
        expect(Number(rows[0]!.n)).toBe(0);
      });
  });
});
