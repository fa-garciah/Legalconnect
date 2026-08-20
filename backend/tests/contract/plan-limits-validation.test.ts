/**
 * T097 — negative or non-integer limits return `400 validation_failed`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';

describe('PATCH /internal/platform/plans/:code/limits — validation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPlatformApp();
  });

  afterAll(async () => {
    await app.close();
    await closePlatformDb();
  });

  it.each([
    ['a negative limit', { users: -1, storageBytes: 1, monthlyCfdi: 1 }],
    ['a non-integer limit', { users: 10.5, storageBytes: 1, monthlyCfdi: 1 }],
    ['a non-numeric limit', { users: '10', storageBytes: 1, monthlyCfdi: 1 }],
  ])('rejects %s', async (_label, limits) => {
    const response = await request(app.getHttpServer())
      .patch('/internal/platform/plans/esencial/limits')
      .send({ limits });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'validation_failed' } });
  });
});
