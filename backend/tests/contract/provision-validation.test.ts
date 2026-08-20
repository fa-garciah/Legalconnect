/**
 * T067 / FR-007 — validation on provisioning.
 *
 * The database CHECK constraint is the backstop; this layer exists so a malformed
 * request answers 400 with a usable message instead of surfacing a constraint
 * violation as a 500.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('provisioning validation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPlatformApp();
  });

  afterAll(async () => {
    await app.close();
    await closePlatformDb();
  });

  const post = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/internal/platform/tenants').send(body);

  it.each([
    ['a missing name', { rfc: 'TST1234561AB', planCode: 'esencial' }],
    ['an empty name', { name: '', rfc: 'TST1234562AB', planCode: 'esencial' }],
    ['a whitespace-only name', { name: '   ', rfc: 'TST1234563AB', planCode: 'esencial' }],
  ])('rejects %s with 400', async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it.each([
    ['a missing RFC', { name: 'X, S.C.', planCode: 'esencial' }],
    ['an RFC that is too short', { name: 'X, S.C.', rfc: 'TST123', planCode: 'esencial' }],
    ['an RFC that is too long', { name: 'X, S.C.', rfc: 'TSTX123456ABCD', planCode: 'esencial' }],
    ['an RFC with punctuation', { name: 'X, S.C.', rfc: 'TST-123456-AB', planCode: 'esencial' }],
    ['an RFC with letters where digits belong', { name: 'X, S.C.', rfc: 'TSTABCDEFABC', planCode: 'esencial' }],
  ])('rejects %s with 400', async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it.each([
    ['a missing plan', { name: 'X, S.C.', rfc: uniqueRfc() }],
    ['an unknown plan', { name: 'X, S.C.', rfc: uniqueRfc(), planCode: 'platino' }],
  ])('rejects %s with 400', async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('accepts a 13-character RFC for a physical person', async () => {
    // 12 for a moral person, 13 for a physical one. Rejecting 13 would exclude the
    // sole practitioner, who is a real customer shape for this product.
    // 4 letters + 6 digits + 3 homoclave = 13. The homoclave is three characters for
    // both person types; only the name prefix differs in length.
    const rfc = `TSTA${String(Date.now()).slice(-6)}Z90`;
    const response = await post({ name: 'Abogado Individual', rfc, planCode: 'esencial' });
    expect(response.status).toBe(201);
    expect(response.body.rfc).toBe(rfc.toUpperCase());
  });

  it('normalises a lowercase RFC to uppercase', async () => {
    const rfc = uniqueRfc().toLowerCase();
    const response = await post({ name: 'Minusculas, S.C.', rfc, planCode: 'esencial' });
    expect(response.status).toBe(201);
    expect(response.body.rfc).toBe(rfc.toUpperCase());
  });

  it('trims a padded name rather than storing the padding', async () => {
    const response = await post({
      name: '  Espacios, S.C.  ',
      rfc: uniqueRfc(),
      planCode: 'esencial',
    });
    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Espacios, S.C.');
  });

  it('says nothing about the database in the error message', async () => {
    // Principle VI: no internal detail in error messages.
    const response = await post({ name: '', rfc: 'nope', planCode: 'esencial' });
    expect(response.body.error.message).not.toMatch(/constraint|postgres|relation|column|sql/i);
  });
});
