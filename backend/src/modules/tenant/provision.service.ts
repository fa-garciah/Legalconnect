/**
 * T073 — provisioning, as one transaction.
 *
 * US3 scenario 5: a provisioning that fails partway leaves no tenant in a partially
 * created state. That is delivered by the enclosing platform transaction rather than by
 * cleanup code — there is no compensating delete to write, and no DELETE grant to write
 * it with.
 */
import { Injectable } from '@nestjs/common';
import { RfcAlreadyRegistered, ValidationFailed } from '../../common/http/errors';
import { currentPlatformTx } from '../../common/db/platform-context';
import { normaliseName, normalisePlanCode, normaliseRfc } from './rfc';
import { TenantRepository, UNIQUE_VIOLATION, type TenantRow } from './tenant.repository';

interface RawInput {
  readonly name?: unknown;
  readonly rfc?: unknown;
  readonly planCode?: unknown;
}

/**
 * Finds the PostgreSQL SQLSTATE, walking the `cause` chain.
 *
 * Drizzle wraps driver errors in its own error type, so the SQLSTATE is on `.cause`
 * rather than on the thrown object. Matching only the top level looks correct, compiles,
 * and never fires — a duplicate RFC would surface as a 500 instead of the 409 FR-007
 * requires, and only a concurrency test would notice.
 */
const errorCode = (error: unknown): string | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
};

@Injectable()
export class ProvisionService {
  constructor(private readonly tenants: TenantRepository) {}

  async provision(input: RawInput): Promise<TenantRow> {
    const name = normaliseName(input.name);
    const rfc = normaliseRfc(input.rfc);
    const planCode = normalisePlanCode(input.planCode);

    try {
      return await this.tenants.insert(currentPlatformTx(), { name, rfc, planCode });
    } catch (error) {
      // Mapped from the DATABASE's unique violation, not from a prior existence check.
      // A read-then-write would pass a sequential duplicate test and still let two
      // concurrent callers both succeed, because both would read "available".
      if (errorCode(error) === UNIQUE_VIOLATION) throw new RfcAlreadyRegistered();

      // A missing plan row surfaces as a not-null violation on plan_id. Reported as
      // validation rather than as a server error, because the caller can fix it.
      if (errorCode(error) === '23502') {
        throw new ValidationFailed('The named plan does not exist.');
      }
      throw error;
    }
  }
}
