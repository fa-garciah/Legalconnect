/**
 * T092 — rolling monthly partition creation ahead of need.
 *
 * drizzle/0004_audit_partitions.sql creates a fixed run of partitions once, at
 * migration time (25 months back, 2 ahead). That covers the retention window on day
 * one but does not keep covering it as calendar months pass with no fresh migration
 * — a long-running deployment would eventually reach a month with no partition
 * waiting, and every insert into it would fail with no warning beforehand. This
 * keeps the next few months created ahead of time, using the platform role's
 * EXECUTE grant on audit_event_ensure_partition (0004; calling it as lc_platform
 * only works because 0010 made it SECURITY DEFINER).
 */
import { sql } from 'drizzle-orm';
import { platformDb } from '../../common/db/platform-client';

/** Matches the lookahead margin the initial migration itself used. */
export const PARTITION_LOOKAHEAD_MONTHS = 2;

export async function ensureUpcomingPartitions(now: Date = new Date()): Promise<void> {
  const db = platformDb();
  for (let i = 0; i <= PARTITION_LOOKAHEAD_MONTHS; i += 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const monthDate = month.toISOString().slice(0, 10);
    await db.execute(sql`SELECT audit_event_ensure_partition(${monthDate}::date)`);
  }
}
