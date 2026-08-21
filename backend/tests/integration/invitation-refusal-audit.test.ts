/**
 * US4 scenario 5, FR-034 — every refusal on the accept path is recorded, and
 * the entry does not disclose which of the possible reasons applied.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';

describe('invitation refusal is audited without disclosing the reason (FR-034)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createRealApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('records exactly one invitation.refused entry for a nonexistent reference, with no distinguishing field', async () => {
    const reference = `refusal-audit-${Date.now()}`;
    const response = await request(app.getHttpServer())
      .post(`/identity/invitations/${reference}/accept`)
      .set('x-subject', 'idp|refusal-audit')
      .set('x-email', 'x@example.com')
      .send();
    expect(response.status).toBe(400);

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query(
        `SELECT metadata, actor_identity_id, actor_membership_id, tenant_id FROM audit_event
          WHERE action = 'invitation.refused' ORDER BY occurred_at DESC LIMIT 1`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.metadata).toEqual({});
      expect(rows[0]!.actor_identity_id).toBeNull();
      expect(rows[0]!.actor_membership_id).toBeNull();
      expect(rows[0]!.tenant_id).toBeNull();
    } finally {
      await migration.end();
    }
  });
});
