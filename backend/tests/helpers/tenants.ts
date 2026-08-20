import { connectAs } from './db';
import {
  IDENTITY_DUAL,
  IDENTITY_OUTSIDER,
  IDENTITY_SINGLE,
  membershipsFor,
} from '../fixtures/identity';
import type { MembershipRecord } from '../../src/common/tenant/membership';

export interface SeededTenants {
  readonly a: string;
  readonly b: string;
}

/** The two tenants drizzle/seed.ts creates, in creation order. */
export async function seededTenantIds(): Promise<SeededTenants> {
  const platform = await connectAs('platform');
  try {
    const { rows } = await platform.query<{ id: string }>(
      'SELECT id FROM tenant ORDER BY created_at, id',
    );
    if (rows.length < 2) throw new Error('run `npm run db:seed` — two tenants are required');
    return { a: rows[0]!.id, b: rows[1]!.id };
  } finally {
    await platform.end();
  }
}

export function membershipFixtures(t: SeededTenants): readonly MembershipRecord[] {
  return membershipsFor(t.a, t.b) as readonly MembershipRecord[];
}

export { IDENTITY_DUAL, IDENTITY_OUTSIDER, IDENTITY_SINGLE };
