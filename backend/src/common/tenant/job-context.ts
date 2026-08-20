/**
 * T049 — asynchronous work runs the identical activation path.
 *
 * The tenant travels in the ENVELOPE, not the payload. Putting it in the payload would
 * make it business data that a handler could read, ignore, or overwrite; in the
 * envelope it is routing metadata the worker must act on before the handler sees
 * anything.
 *
 * FR-005 puts jobs, queues, caches, files, logs and backups under the same isolation
 * as requests, and the constitution requires a cross-tenant leak test for every async
 * job — not only every endpoint.
 */
import type { Tx } from '../db/client';
import { resolvePrincipal } from './resolve';
import type { MembershipPort } from './membership';
import { runInTenantContext } from './middleware';

export interface JobEnvelope<T> {
  readonly tenantId: string;
  readonly identityId: string;
  readonly payload: T;
}

export class JobRefused extends Error {
  constructor(readonly reason: string) {
    super(`job refused: ${reason}`);
    this.name = 'JobRefused';
  }
}

export async function runJob<T, R>(
  envelope: JobEnvelope<T>,
  memberships: MembershipPort,
  handler: (tx: Tx, payload: T) => Promise<R>,
): Promise<R> {
  const resolution = await resolvePrincipal(
    { identityId: envelope.identityId, tenantId: envelope.tenantId },
    memberships,
  );

  // A job whose envelope names a tenant its identity has no membership in is refused,
  // not run with reduced scope. There is no partial-success mode here.
  if (!resolution.ok) throw new JobRefused(resolution.reason);

  return runInTenantContext(resolution.principal, (tx) => handler(tx, envelope.payload));
}
