/** The real identity/membership rows drizzle/seed.ts creates (slice 002). */
import { connectAs } from './db';

export interface SeededIdentities {
  readonly dualId: string;
  readonly dualMembershipA: string;
  readonly dualMembershipB: string;
  readonly outsiderId: string;
}

export async function seededIdentities(): Promise<SeededIdentities> {
  const migration = await connectAs('migration');
  try {
    const dual = await migration.query<{ id: string }>(
      `SELECT id FROM identity WHERE subject = 'idp|dual-tenant-counsel'`,
    );
    const outsider = await migration.query<{ id: string }>(
      `SELECT id FROM identity WHERE subject = 'idp|no-membership'`,
    );
    if (dual.rows.length === 0 || outsider.rows.length === 0) {
      throw new Error('run `npm run db:seed` — the dual and outsider identities are required');
    }
    const dualId = dual.rows[0]!.id;
    const outsiderId = outsider.rows[0]!.id;

    const memberships = await migration.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM membership WHERE identity_id = $1 ORDER BY created_at`,
      [dualId],
    );
    if (memberships.rows.length < 2) {
      throw new Error('the dual identity must hold a membership in both seeded tenants');
    }

    return {
      dualId,
      dualMembershipA: memberships.rows[0]!.id,
      dualMembershipB: memberships.rows[1]!.id,
      outsiderId,
    };
  } finally {
    await migration.end();
  }
}
