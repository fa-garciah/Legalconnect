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

@Injectable()
export class S3ObjectStore implements ObjectStorePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3ObjectStoreConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
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
