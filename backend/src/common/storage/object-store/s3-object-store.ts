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
  HeadBucketCommand,
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
  private ready?: Promise<{ readonly client: S3Client; readonly bucket: string }>;

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

  /**
   * Memoised: the client is built once, on the first call that needs it.
   *
   * **The bucket's own region wins over `OBJECT_STORE_REGION`** on real AWS (no custom
   * endpoint). Found pointing the app at a real bucket: the configured region was `us-east-1`,
   * the bucket lived in `eu-central-1`, and every request failed with `PermanentRedirect`. The
   * SDK's `followRegionRedirects` would rescue ordinary requests but not a PRESIGNED URL, which
   * is signed locally with whatever region the client has — so the preview and download links
   * would still be wrong. Instead, the first use asks AWS where the bucket is (`HeadBucket`,
   * whose answer or 301 carries `x-amz-bucket-region`) and builds the client for that region.
   * Switching buckets is then only a matter of credentials and name.
   */
  private store(): Promise<{ readonly client: S3Client; readonly bucket: string }> {
    // A failed resolution is not memoised: the next request tries again.
    this.ready ??= this.resolve().catch((error: unknown) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  private build(config: S3ObjectStoreConfig, region: string): S3Client {
    return new S3Client({
      endpoint: config.endpoint,
      region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  private async resolve(): Promise<{ readonly client: S3Client; readonly bucket: string }> {
    const config = this.configure();
    const client = this.build(config, config.region);
    if (config.endpoint) {
      // MinIO or another S3-compatible service: regions are nominal, nothing to discover.
      this.resolved = { client, bucket: config.bucket };
      return this.resolved;
    }
    const actual = await bucketRegion(client, config.bucket);
    const region = actual && actual !== config.region ? actual : config.region;
    if (region !== config.region) {
      console.warn(`[object-store] OBJECT_STORE_REGION is ${config.region} but the bucket is in ${region}; using ${region}.`);
    }
    this.resolved = { client: region === config.region ? client : this.build(config, region), bucket: config.bucket };
    return this.resolved;
  }

  async put(input: PutObjectInput): Promise<void> {
    const { client, bucket } = await this.store();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async presignGet(
    key: string,
    options: { readonly contentDisposition?: string } = {},
  ): Promise<PresignedUrl> {
    const { client, bucket } = await this.store();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: options.contentDisposition,
    });
    const url = await getSignedUrl(client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
    return { url, expiresAt: new Date(Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000) };
  }

  /** research.md D4 — used only for upload-failure rollback, never a user-facing delete. */
  async delete(key: string): Promise<void> {
    const { client, bucket } = await this.store();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

/**
 * Where AWS says the bucket is: `BucketRegion` on success, the `x-amz-bucket-region` header on a
 * 301/400/403. `null` when neither is available — the configured region is then kept and any
 * real problem surfaces on the operation itself, with AWS's own message.
 */
async function bucketRegion(client: S3Client, bucket: string): Promise<string | null> {
  try {
    const head = await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return head.BucketRegion ?? null;
  } catch (error) {
    const headers = (error as { $response?: { headers?: Record<string, string> } }).$response?.headers;
    return headers?.['x-amz-bucket-region'] ?? null;
  }
}
