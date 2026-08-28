import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertApplicationRoleIsSafe } from './common/db/client';
import { ensureUpcomingPartitions } from './modules/audit/partition-maintenance';

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

async function bootstrap(): Promise<void> {
  loadEnvFile(join(__dirname, '..', '.env'));

  // Before serving anything. This is the single misconfiguration that leaves every
  // policy in place, every isolation test green, and no isolation whatsoever — so the
  // process refuses to start rather than starting unsafely.
  await assertApplicationRoleIsSafe();

  // Best-effort. A month with no partition waiting causes inserts into it to fail
  // later; it does not mean isolation is broken now, so unlike the role check above
  // this warns rather than refusing to boot (T092).
  try {
    await ensureUpcomingPartitions();
  } catch (error) {
    console.warn('failed to ensure upcoming audit_event partitions:', error);
  }

  const app = await NestFactory.create(AppModule);

  /*
   * Cross-origin access for the browser client (018-frontend-clients).
   *
   * **Why this appeared only now.** `016a` shipped the frontend shell and it makes no
   * network calls at all; `018` is the first slice where a browser talks to this API. The
   * two run on different ports by design — `next dev` takes 3000, this takes 3001 — which
   * makes every call cross-origin. Without this, the preflight `OPTIONS` 404s, the browser
   * blocks the request before it is sent, and the frontend sees a network failure with no
   * response to classify. On screen that is the opaque "no se pudo completar esta acción",
   * which says nothing about the actual cause. curl does not enforce any of this, so the
   * API looks perfectly healthy from a terminal.
   *
   * **An explicit list, never a wildcard.** This slice authenticates nothing — identity,
   * sessions and MFA are `003` and `005` — so the whole surface is bound to loopback and
   * treated as unreachable. A wildcard origin would let any page a developer happens to
   * visit issue requests to their own `localhost:3001` and read the replies, which for a
   * server that trusts `x-identity-id` outright means reading any tenant's data. The
   * origins are therefore named, and in production they must be named explicitly: the
   * localhost default applies only outside production, where it saves every developer
   * rediscovering the paragraph above.
   *
   * Credentials are NOT enabled. Nothing here reads a cookie — `apiFetch` sends identity
   * and tenant as headers — so allowing them would widen the surface for no benefit.
   */
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins =
    configuredOrigins.length > 0
      ? configuredOrigins
      : process.env.NODE_ENV === 'production'
        ? []
        : ['http://localhost:3000'];

  if (allowedOrigins.length > 0) {
    app.enableCors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type', 'x-identity-id', 'x-tenant-id'],
      credentials: false,
    });
  } else {
    console.warn(
      'CORS_ALLOWED_ORIGINS is unset in production: no browser origin may call this API. ' +
        'Set it to the frontend origin, or leave it unset deliberately for a server-to-server deployment.',
    );
  }

  const port = Number(process.env.PORT ?? 3000);

  // This slice authenticates nothing: identity, sessions and MFA are slices 002, 003
  // and 005. An exposed platform surface would therefore perform unauthenticated
  // tenant creation and plan changes. Binding to loopback is a deployment
  // constraint, not a suggestion (contracts/README.md).
  const host = process.env.PLATFORM_BIND_HOST ?? '127.0.0.1';

  await app.listen(port, host);
  console.log(`listening on http://${host}:${port}`);
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.warn(
      'WARNING: bound to a non-loopback address while this slice authenticates nothing. ' +
        'The platform administration surface must not be network-reachable before slice 003.',
    );
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
