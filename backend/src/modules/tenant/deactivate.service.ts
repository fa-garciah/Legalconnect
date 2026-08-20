/**
 * T074 — deactivation, the one-way transition of FR-006.
 *
 * There is no reactivation method here, and that is deliberate rather than unfinished.
 * `spec.md` specifies deactivation as one-way; adding an undo would be a new
 * requirement, so it belongs in a spec amendment rather than in this file.
 */
import { Injectable } from '@nestjs/common';
import { AlreadyDeactivated, ResourceNotFound } from '../../common/http/errors';
import { currentPlatformTx } from '../../common/db/platform-context';
import { TenantRepository, type TenantRow } from './tenant.repository';

@Injectable()
export class DeactivateService {
  constructor(private readonly tenants: TenantRepository) {}

  async deactivate(id: string): Promise<TenantRow> {
    const tx = currentPlatformTx();

    const updated = await this.tenants.deactivate(tx, id);
    if (updated) return updated;

    // The UPDATE matched nothing, which means either the tenant does not exist or it
    // was already deactivated. Distinguished by a follow-up read so the caller gets
    // 404 or 409 rather than one ambiguous answer — and the read is safe to make here
    // because this is the platform surface, where tenant existence is not a secret.
    const existing = await this.tenants.findById(tx, id);
    if (!existing) throw new ResourceNotFound();
    throw new AlreadyDeactivated();
  }
}
