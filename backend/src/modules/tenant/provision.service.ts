/**
 * T073 — provisioning, as one transaction.
 *
 * US3 scenario 5: a provisioning that fails partway leaves no tenant in a partially
 * created state. That is delivered by the enclosing platform transaction rather than by
 * cleanup code — there is no compensating delete to write, and no DELETE grant to write
 * it with.
 *
 * T035 (017/FR-009) — a new tenant's first rows now include its default position
 * catalog, written on this same transaction. research.md D2 asked for exactly this:
 * "the same insert runs wherever 001's tenant-provisioning path already writes a
 * tenant's first rows — extending that write, not adding a second provisioning
 * mechanism." Because it is the same transaction, SC-008 ("0 manual setup steps") and
 * US3 scenario 5 ("no partially created state") hold together: a tenant either exists
 * with its catalog, or does not exist.
 */
import { Injectable } from '@nestjs/common';
import { RfcAlreadyRegistered, ValidationFailed } from '../../common/http/errors';
import { currentPlatformTx } from '../../common/db/platform-context';
import { normaliseName, normalisePlanCode, normaliseRfc } from './rfc';
import { TenantRepository, UNIQUE_VIOLATION, type TenantRow } from './tenant.repository';
import { seedDefaultPositionCatalog } from '../directory/position-catalog.seed';
import { seedDefaultCaseCatalogs } from '../case-core/catalogs/case-catalog.seed';
import { seedDefaultDocumentCategories } from '../documents/categories/document-category.seed';

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
      const tx = currentPlatformTx();
      const tenant = await this.tenants.insert(tx, { name, rfc, planCode });
      // FR-009 — inside the same transaction, so the two cannot come apart.
      await seedDefaultPositionCatalog(tx, tenant.id);
      // 006/FR-021 — the same transaction again, so a tenant provisioned after that slice
      // receives all FOUR catalogs through one provisioning operation, not two. A firm
      // either exists with its whole vocabulary or does not exist.
      await seedDefaultCaseCatalogs(tx, tenant.id);
      // 007/FR-009 — the same transaction again. A tenant provisioned after this slice
      // receives all FIVE catalogs through one provisioning operation.
      await seedDefaultDocumentCategories(tx, tenant.id);
      return tenant;
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
