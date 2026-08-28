/**
 * T010 — research.md D6. The only file in this codebase permitted to import
 * `@aws-sdk/*` (verified by T049). Local dev points this at MinIO
 * (docker-compose.yml's `minio` service); production points the identical client at
 * real S3 in `mx-central-1` (plan.md Constraints) — no code path here changes between
 * the two, only the four `OBJECT_STORE_*` environment values.
 */
import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorePort, PresignedUrl, PutObjectInput } from './object-store.port';

const PRESIGNED_URL_TTL_SECONDS = 300;

export interface S3ObjectStoreConfig {
  readonly endpoint?: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle?: boolean;
}

/**
 * Resolved on FIRST USE, not at construction — see `S3ObjectStore`'s own note. A thunk
 * rather than the config itself is what lets a missing environment value fail the one
 * request that needs it instead of the whole process.
 */
export type S3ObjectStoreConfigSource = S3ObjectStoreConfig | (() => S3ObjectStoreConfig);

@Injectable()
export class S3ObjectStore implements ObjectStorePort {
  private readonly configure: () => S3ObjectStoreConfig;
  private resolved?: { readonly client: S3Client; readonly bucket: string };

  /**
   * Accepts a thunk so configuration errors surface **lazily**.
   *
   * Passing a plain config object still works and is what the tests use; production passes
   * the thunk `DocumentsModule` builds from the environment.
   *
   * **Why this matters more than it looks.** `objectStoreConfig()` throws when an
   * `OBJECT_STORE_*` value is absent. Called eagerly from a Nest `useFactory`, that throw
   * aborts application initialization — and vitest reports an aborted init as
   * `Worker exited unexpectedly` with the cause swallowed. The observable result was that
   * EVERY test booting `AppModule` failed, across every slice, from one missing block in
   * `.env`. It read as a repo-wide breakage rather than as configuration.
   *
   * Deferring the read to first use keeps the failure proportionate: a developer who has
   * not configured object storage still gets a working application, their unrelated tests
   * still pass, and the one request that actually needs a bucket fails with the message
   * `objectStoreConfig()` was already written to give. Nothing is hidden — the same error
   * is thrown, at the point where it is actionable.
   */
  constructor(config: S3ObjectStoreConfigSource) {
    this.configure = typeof config === 'function' ? config : () => config;
  }

  /** Memoised: the client is built once, on the first call that needs it. */
  private get store(): { readonly client: S3Client; readonly bucket: string } {
    if (!this.resolved) {
      const config = this.configure();
      this.resolved = {
        bucket: config.bucket,
        client: new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          forcePathStyle: config.forcePathStyle,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }),
      };
    }
    return this.resolved;
  }

  private get client(): S3Client {
    return this.store.client;
  }

  private get bucket(): string {
    return this.store.bucket;
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async presignGet(key: string): Promise<PresignedUrl> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
    return { url, expiresAt: new Date(Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000) };
  }

  /** research.md D4 — used only for upload-failure rollback, never a user-facing delete. */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
