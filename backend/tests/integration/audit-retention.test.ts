/**
 * T085 / FR-019 — the retention routine drops partitions past the 24-month window,
 * and the application role cannot invoke it.
 *
 * `audit_event_ensure_partition` / `audit_event_drop_expired_partitions` already
 * exist as of drizzle/0004_audit_partitions.sql, granted to `lc_retention` (and
 * `ensure_partition` also to `lc_platform`). This test exercises that mechanism end
 * to end rather than re-deciding it, and is the check T091's retention job must keep
 * passing.
 *
 * A synthetic, deliberately-old partition is created fresh in `beforeAll` rather
 * than relying on whatever the initial migration happened to create — that keeps
 * the test repeatable: a prior run dropping the same partition would otherwise leave
 * nothing left to drop on the next run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';

describe('audit partition retention', () => {
  let platform: Client;
  let retention: Client;
  let appClient: Client;
  let partitionName: string;
  let targetMonth: string;

  beforeAll(async () => {
    platform = await connectAs('platform');
    retention = await connectAs('retention');
    appClient = await connectAs('app');

    const old = new Date();
    old.setUTCMonth(old.getUTCMonth() - 30);
    old.setUTCDate(1);
    targetMonth = old.toISOString().slice(0, 10);
    partitionName = `audit_event_${old.getUTCFullYear()}_${String(old.getUTCMonth() + 1).padStart(2, '0')}`;

    await platform.query('SELECT audit_event_ensure_partition($1::date)', [targetMonth]);
  });

  afterAll(async () => {
    await platform.end();
    await retention.end();
    await appClient.end();
  });

  const partitionExists = async (): Promise<boolean> => {
    const { rowCount } = await platform.query('SELECT 1 FROM pg_class WHERE relname = $1', [
      partitionName,
    ]);
    return (rowCount ?? 0) > 0;
  };

  it('creates the synthetic partition to prove the fixture itself is sound', async () => {
    expect(await partitionExists()).toBe(true);
  });

  it('the application role cannot invoke the drop routine', async () => {
    await expect(appClient.query('SELECT audit_event_drop_expired_partitions(24)')).rejects.toThrow(
      /permission denied/i,
    );
    // Refused, not silently skipped — the partition must still be there afterward.
    expect(await partitionExists()).toBe(true);
  });

  it('the retention role drops a partition past the 24-month window', async () => {
    const { rows } = await retention.query<{ audit_event_drop_expired_partitions: string }>(
      'SELECT audit_event_drop_expired_partitions(24)',
    );
    expect(rows.map((r) => r.audit_event_drop_expired_partitions)).toContain(partitionName);
    expect(await partitionExists()).toBe(false);
  });
});
