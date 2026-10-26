/**
 * 024/FR-016 — `GET /health` answers 200 only when the database answers, discloses nothing either
 * way, and never hangs on a database that does not answer at all (Dokploy would otherwise hold the
 * new container out of rotation indefinitely rather than failing it).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { registerHealthRoute } from '../../src/common/http/health';

@Module({})
class EmptyModule {}

let app: INestApplication | undefined;

async function appWith(probe: () => Promise<void>, timeoutMs?: number): Promise<INestApplication> {
  app = await NestFactory.create(EmptyModule, { logger: false });
  registerHealthRoute(app, probe, timeoutMs);
  await app.init();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
});

describe('GET /health', () => {
  // 024 D9: deploy.yml waits for THIS commit to answer, not for any healthy container — the old
  // release answers "ok" too, so a body without the version cannot tell them apart.
  it('answers 200 with the image build SHA when the database answers', async () => {
    vi.stubEnv('BUILD_SHA', 'abc123');
    const res = await request((await appWith(async () => {})).getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: 'abc123' });
  });

  it('says "unknown" rather than omitting the version when the image carries none', async () => {
    vi.stubEnv('BUILD_SHA', '');
    const res = await request((await appWith(async () => {})).getHttpServer()).get('/health');
    expect(res.body).toEqual({ status: 'ok', version: 'unknown' });
  });

  it('carries no version when unavailable', async () => {
    vi.stubEnv('BUILD_SHA', 'abc123');
    const failing = async (): Promise<void> => {
      throw new Error('down');
    };
    const res = await request((await appWith(failing)).getHttpServer()).get('/health');
    expect(res.body).toEqual({ status: 'unavailable' });
  });

  it('answers 503 and no error detail when the database refuses', async () => {
    const failing = async (): Promise<void> => {
      throw new Error('password authentication failed for user "lc_app"');
    };
    const res = await request((await appWith(failing)).getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
    expect(res.text).not.toContain('lc_app');
  });

  it('answers 503 rather than hanging when the database never answers', async () => {
    const never = (): Promise<void> => new Promise(() => {});
    const started = Date.now();
    const res = await request((await appWith(never, 50)).getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
