import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertApplicationRoleIsSafe } from './common/db/client';

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

  const app = await NestFactory.create(AppModule);

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
