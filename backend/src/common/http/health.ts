/**
 * 024/FR-016 — `GET /health`, what Dokploy and the post-deploy smoke step ask before routing
 * traffic to a new container.
 *
 * **Registered on the HTTP server, not as a Nest controller, on purpose.** Every controller route
 * passes SessionGuard, the tenant context and the authorization interceptor, and an ungated one has
 * to join `capability-declared-everywhere.test.ts`'s enumerated list of authentication
 * controllers. A liveness probe is none of those things: it runs before anyone is signed in, names
 * no firm, and must answer the same whoever asks. Putting it beside the router rather than inside
 * it keeps the "every route declares a capability" rule exact instead of adding a fifth exception.
 *
 * It discloses nothing about the firms or the infrastructure: `{"status":"ok","version":"<sha>"}` or
 * `{"status":"unavailable"}`, never a tenant count or an error message. The version is the commit
 * the image was built from (`BUILD_SHA`, set by deploy.yml); that commit is already public in the
 * repository, and without it the post-deploy wait cannot tell the new release from the old one,
 * which answers "ok" just the same (024 D9).
 *
 * The probe is one `SELECT 1` on the application's own connection, the
 * dependency a request cannot do without; object storage is not probed, because a slow S3 would
 * take every container out of rotation for a failure that affects only documents.
 */
import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { appDb } from '../db/client';

const PROBE_TIMEOUT_MS = 3000;

interface HealthResponse {
  status(code: number): HealthResponse;
  json(body: unknown): void;
}

interface HttpServer {
  get(path: string, handler: (request: unknown, response: HealthResponse) => void): void;
}

async function probeDatabase(): Promise<void> {
  await appDb().execute(sql`SELECT 1`);
}

function withTimeout(probe: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('health probe timed out')), ms);
  });
  return Promise.race([probe, timeout]).finally(() => clearTimeout(timer));
}

/** Call before `app.listen()`: routes added to the server first are matched first. */
export function registerHealthRoute(
  app: INestApplication,
  probe: () => Promise<void> = probeDatabase,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): void {
  const server = app.getHttpAdapter().getInstance() as HttpServer;
  const version = process.env.BUILD_SHA || 'unknown';
  server.get('/health', (_request, response) => {
    withTimeout(probe(), timeoutMs).then(
      () => response.status(200).json({ status: 'ok', version }),
      () => response.status(503).json({ status: 'unavailable' }),
    );
  });
}
