/**
 * T026 — the KeyProvider port. research.md D5.
 *
 * A TOTP secret CANNOT BE HASHED. It must be readable on every verification, which
 * makes it the most sensitive recoverable material in this database: anyone who can
 * read `identity_factor.secret_ciphertext` in the clear holds a working second
 * factor for that person. The constitution therefore requires it "encrypted at rest
 * under an application-held key that is SEPARATE FROM THE DATABASE" — envelope
 * encryption or KMS — so that a dump, a restored backup, or read access to the
 * table is not sufficient to derive one (FR-013, SC-008).
 *
 * WHY A PORT AND NOT JUST KMS. The constitution records an open `[PENDING]`: the
 * AWS account blockage may be account-wide rather than scoped to one service. If it
 * is, KMS is unreachable too — and the entire reason slice 003 was unblocked by the
 * v1.5.0 amendment was to stop a blocked account from halting authentication.
 * Hard-wiring KMS would reintroduce that halt through a different door. It would
 * also make every test that touches enrollment require AWS credentials, which
 * contradicts the Testcontainers discipline every prior slice uses.
 *
 * THE LOCAL PROVIDER IS NOT A PRODUCTION FALLBACK. Configuration fails closed if a
 * deployed environment resolves it — a startup assertion in main.ts (T027), not a
 * warning that scrolls past.
 */
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface WrappedSecret {
  /** Which key wrapped it, so rotation is a re-wrap rather than a re-enrollment. */
  readonly keyReference: string;
  readonly ciphertext: Buffer;
}

export interface KeyProvider {
  readonly reference: string;
  wrap(plaintext: Buffer): Promise<WrappedSecret>;
  /**
   * THROWS when the key is unavailable, when the reference does not match, or when
   * the ciphertext fails its authentication tag. It never returns a falsy result.
   *
   * FR-017 makes a key outage indistinguishable from a wrong code TO THE PERSON —
   * but that collapse belongs at the sign-in boundary, decided deliberately, not
   * here by an unwrap quietly returning null that a caller then reads as "the code
   * did not match". A silent falsy would make a total key outage look like every
   * user in the system simultaneously mistyping, with nothing anywhere saying
   * otherwise. plan.md records the monitoring signal this needs as an infra
   * deliverable precisely because the caller-visible signal is deliberately absent.
   */
  unwrap(keyReference: string, ciphertext: Buffer): Promise<Buffer>;
}

export class KeyUnavailable extends Error {
  constructor(reference: string, cause: string) {
    super(`key ${reference} unavailable: ${cause}`);
    this.name = 'KeyUnavailable';
  }
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM under a key held in the environment. Development and CI only.
 *
 * GCM rather than CBC deliberately: authenticated encryption means a flipped byte
 * fails the tag check rather than decrypting to a different secret that then fails
 * verification for a reason nobody can diagnose. Layout is iv || tag || ciphertext.
 */
export class LocalKeyProvider implements KeyProvider {
  private readonly key: Buffer;

  constructor(
    base64Key: string,
    readonly reference = 'local:env',
  ) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) {
      // Loud at construction rather than silently weakening every secret in the
      // database. A short key is a configuration error, not a degraded mode.
      throw new Error(
        `AUTH_LOCAL_KEY must decode to exactly 32 bytes, got ${key.length}. Generate one with: openssl rand -base64 32`,
      );
    }
    this.key = key;
  }

  async wrap(plaintext: Buffer): Promise<WrappedSecret> {
    // A fresh IV per wrap, so the same secret enrolled twice does not produce the
    // same ciphertext — otherwise read access would reveal that two identities
    // share a secret, and reuse would leak far worse.
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      keyReference: this.reference,
      ciphertext: Buffer.concat([iv, cipher.getAuthTag(), body]),
    };
  }

  async unwrap(keyReference: string, ciphertext: Buffer): Promise<Buffer> {
    if (keyReference !== this.reference) {
      throw new KeyUnavailable(keyReference, `this provider holds ${this.reference}`);
    }
    if (ciphertext.length < IV_BYTES + TAG_BYTES) {
      throw new KeyUnavailable(keyReference, 'ciphertext is too short to be well-formed');
    }
    const iv = ciphertext.subarray(0, IV_BYTES);
    const tag = ciphertext.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = ciphertext.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(body), decipher.final()]);
    } catch {
      // The tag failed: wrong key, or the stored bytes were altered. Both are
      // "unavailable" from the caller's point of view, and neither may return a
      // plaintext.
      throw new KeyUnavailable(keyReference, 'authentication tag did not verify');
    }
  }
}

/** The two KMS command shapes this module needs, kept structural so tests can fake them. */
export interface KmsCommands {
  Encrypt: new (input: { KeyId: string; Plaintext: Uint8Array }) => unknown;
  Decrypt: new (input: { KeyId: string; CiphertextBlob: Uint8Array }) => unknown;
}

export interface KmsLike {
  send(command: unknown): Promise<unknown>;
}

/**
 * AWS KMS. The deployed-environment implementation.
 *
 * Encrypt/Decrypt directly against the CMK rather than GenerateDataKey: a TOTP
 * secret is tens of bytes, far inside KMS's 4 KiB limit, and a per-secret data key
 * would add a round trip and a second thing to store for no gain at this size.
 *
 * Access to this key is restricted and audited to the same standard the
 * constitution sets for PAC/CSD credentials, including step-up MFA on operations
 * that touch it (FR-016). That policy is infrastructure — infra/, task T100 — not
 * something this module can assert.
 */
export class KmsKeyProvider implements KeyProvider {
  constructor(
    readonly reference: string,
    private readonly client: KmsLike,
    private readonly commands: KmsCommands,
  ) {}

  async wrap(plaintext: Buffer): Promise<WrappedSecret> {
    try {
      const out = (await this.client.send(
        new this.commands.Encrypt({ KeyId: this.reference, Plaintext: plaintext }),
      )) as { CiphertextBlob?: Uint8Array };
      if (!out.CiphertextBlob) throw new Error('KMS returned no ciphertext');
      return { keyReference: this.reference, ciphertext: Buffer.from(out.CiphertextBlob) };
    } catch (cause) {
      throw new KeyUnavailable(this.reference, (cause as Error).message);
    }
  }

  async unwrap(keyReference: string, ciphertext: Buffer): Promise<Buffer> {
    try {
      const out = (await this.client.send(
        new this.commands.Decrypt({ KeyId: keyReference, CiphertextBlob: ciphertext }),
      )) as { Plaintext?: Uint8Array };
      if (!out.Plaintext) throw new Error('KMS returned no plaintext');
      return Buffer.from(out.Plaintext);
    } catch (cause) {
      throw new KeyUnavailable(keyReference, (cause as Error).message);
    }
  }
}

export type KeyProviderKind = 'local' | 'kms';

export function configuredKeyProviderKind(env: NodeJS.ProcessEnv = process.env): KeyProviderKind {
  return env.AUTH_KEY_PROVIDER === 'kms' ? 'kms' : 'local';
}

/**
 * Resolves the provider from configuration. AUTH_KEY_PROVIDER is a PARAMETER, NOT A
 * SWITCH: it selects where the key comes from and can never disable enrollment or
 * the challenge (FR-007). There is no third value meaning "no encryption".
 */
export function resolveKeyProvider(env: NodeJS.ProcessEnv = process.env): KeyProvider {
  if (configuredKeyProviderKind(env) === 'kms') {
    const keyId = env.AUTH_KMS_KEY_ID;
    if (!keyId) throw new Error('AUTH_KEY_PROVIDER=kms requires AUTH_KMS_KEY_ID');
    // Statically imported, matching how 007 imports the S3 client. A lazy require
    // would save loading the SDK in dev, which is not worth a non-standard import
    // form in the module that holds the envelope key.
    return new KmsKeyProvider(keyId, new KMSClient({}), {
      Encrypt: EncryptCommand,
      Decrypt: DecryptCommand,
    });
  }

  const local = env.AUTH_LOCAL_KEY;
  if (!local) throw new Error('AUTH_KEY_PROVIDER=local requires AUTH_LOCAL_KEY');
  return new LocalKeyProvider(local);
}
