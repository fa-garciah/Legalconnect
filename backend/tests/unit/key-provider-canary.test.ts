/**
 * 024 D12 — a deployed API proves at boot that its envelope key works, by wrapping and unwrapping a
 * random canary. `assertKeyProviderIsSafe` only checks that the provider is KMS; `/health` only
 * probes the database (health.ts). Without this, a missing `kms:Decrypt` grant deploys green and
 * surfaces as every MFA enrolment failing.
 */
import { describe, expect, it } from 'vitest';
import {
  assertKeyProviderReachable,
  KeyProviderUnreachable,
} from '../../src/common/auth/deployment-assertions';
import { KeyUnavailable, type KeyProvider } from '../../src/common/auth/key-provider';

const DEPLOYED = { NODE_ENV: 'production', AUTH_KEY_PROVIDER: 'kms' } as NodeJS.ProcessEnv;
const KEY = 'arn:aws:kms:mx-central-1:000000000000:key/test';

function provider(overrides: Partial<KeyProvider> = {}): KeyProvider & { wrapped: Buffer[] } {
  const wrapped: Buffer[] = [];
  return {
    reference: KEY,
    wrapped,
    async wrap(plaintext) {
      wrapped.push(Buffer.from(plaintext));
      return { keyReference: KEY, ciphertext: Buffer.from(plaintext).reverse() };
    },
    async unwrap(_ref, ciphertext) {
      return Buffer.from(ciphertext).reverse();
    },
    ...overrides,
  };
}

describe('assertKeyProviderReachable', () => {
  it('resolves when the key round-trips a canary', async () => {
    const p = provider();
    await expect(assertKeyProviderReachable(DEPLOYED, () => p)).resolves.toBeUndefined();
    expect(p.wrapped).toHaveLength(1);
    expect(p.wrapped[0]).toHaveLength(32);
  });

  it('refuses to start when the key cannot wrap, naming the key and the cause', async () => {
    const p = provider({
      wrap: async () => {
        throw new KeyUnavailable(
          KEY,
          'AccessDeniedException: not authorized to perform kms:Encrypt',
        );
      },
    });
    const failure = assertKeyProviderReachable(DEPLOYED, () => p);
    await expect(failure).rejects.toBeInstanceOf(KeyProviderUnreachable);
    await expect(failure).rejects.toThrow(KEY);
    await expect(failure).rejects.toThrow(/kms:Encrypt/);
  });

  it('refuses to start when the key cannot unwrap what it wrapped', async () => {
    const p = provider({
      unwrap: async () => {
        throw new KeyUnavailable(
          KEY,
          'AccessDeniedException: not authorized to perform kms:Decrypt',
        );
      },
    });
    await expect(assertKeyProviderReachable(DEPLOYED, () => p)).rejects.toBeInstanceOf(
      KeyProviderUnreachable,
    );
  });

  it('refuses to start when the round trip returns different bytes, without printing them', async () => {
    const p = provider({ unwrap: async () => Buffer.alloc(32, 7) });
    const failure = assertKeyProviderReachable(DEPLOYED, () => p);
    await expect(failure).rejects.toBeInstanceOf(KeyProviderUnreachable);
    const message = await failure.catch((e: Error) => e.message);
    const [canary] = p.wrapped;
    expect(canary).toBeDefined();
    expect(message).not.toContain(canary!.toString('hex'));
    expect(message).not.toContain(canary!.toString('base64'));
  });

  it('does nothing outside a deployed environment (dev and CI use the local key)', async () => {
    let resolved = false;
    await assertKeyProviderReachable({ NODE_ENV: 'test' } as NodeJS.ProcessEnv, () => {
      resolved = true;
      return provider();
    });
    expect(resolved).toBe(false);
  });
});
