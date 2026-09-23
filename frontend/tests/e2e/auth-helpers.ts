/**
 * Shared helpers for the 003 e2e specs.
 *
 * Extracted after the second spec needed the same TOTP derivation and the same
 * "is this configured?" gate. Three copies of an RFC 6238 implementation across
 * three specs is how one of them quietly drifts.
 */
import { createHmac } from 'node:crypto';
import type { Page } from '@playwright/test';

/**
 * An identity the specs may act as. NOT checked in: 003 deleted
 * `principal.fixture.json` precisely to stop authentication material living in
 * the repository, and a TOTP secret is the most sensitive kind of it.
 */
export const E2E = {
  email: process.env.E2E_SIGNIN_EMAIL ?? '',
  secret: process.env.E2E_SIGNIN_SECRET ?? '',
  password: process.env.E2E_SIGNIN_PASSWORD ?? 'una-contrasena-larga-de-prueba',
  /** An UNENROLLED identity, for the enrollment walk-through. */
  unenrolledEmail: process.env.E2E_UNENROLLED_EMAIL ?? '',
} as const;

export const SKIP_REASON =
  'Set E2E_SIGNIN_EMAIL and E2E_SIGNIN_SECRET (and E2E_UNENROLLED_EMAIL for the enrollment spec) — see tests/e2e/auth-helpers.ts.';

/** RFC 6238 from node:crypto — see the note in auth-sign-in.spec.ts for why not otplib. */
export function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of input.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, epochSeconds = Math.floor(Date.now() / 1000)): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(epochSeconds / 30)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/** The credential step. Leaves the browser wherever the API routed it. */
export async function credentialStep(page: Page, email: string, password = E2E.password): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continuar' }).click();
}

/** Reads every browser storage area, for the FR-051 assertions. */
export async function browserStorage(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const idb: string[] = [];
    if (typeof indexedDB?.databases === 'function') {
      for (const database of await indexedDB.databases()) idb.push(database.name ?? '');
    }
    return JSON.stringify({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
      indexedDb: idb,
    });
  });
}
