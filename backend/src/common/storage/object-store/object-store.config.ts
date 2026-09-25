/**
 * T008 — the four `OBJECT_STORE_*` values, read in one place. 007/research.md D6.
 *
 * This lived inside `documents.module.ts` as a module-private function, which was right
 * while the application was the only caller. `022`'s demo seed needs the same four values to
 * write real objects for the documents it creates, and a second copy is precisely the drift
 * `position-catalog.seed.ts` and `case-catalog.seed.ts` each record having been bitten by:
 * the seed and the production path silently configured differently, with every test passing.
 *
 * Moved beside the port rather than exported from the module, so nothing has to import a
 * Nest module to read configuration.
 */
import type { S3ObjectStoreConfig } from './s3-object-store';

/**
 * Throws when a required value is absent — and is deliberately called LAZILY by
 * `S3ObjectStore` (it takes the function, not its result), so a developer who has not
 * configured object storage still gets a working application and a failure only on the one
 * request that needs a bucket. See the note on `S3ObjectStore`'s constructor.
 */
export function objectStoreConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3ObjectStoreConfig {
  const bucket = env.OBJECT_STORE_BUCKET;
  const accessKeyId = env.OBJECT_STORE_ACCESS_KEY_ID;
  const secretAccessKey = env.OBJECT_STORE_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'OBJECT_STORE_BUCKET, OBJECT_STORE_ACCESS_KEY_ID and OBJECT_STORE_SECRET_ACCESS_KEY are required',
    );
  }
  return {
    // Empty means real AWS S3: the SDK derives the endpoint from the region. An empty string
    // passed through would be taken as an endpoint and fail, so it becomes `undefined`.
    endpoint: env.OBJECT_STORE_ENDPOINT || undefined,
    region: env.OBJECT_STORE_REGION ?? 'mx-central-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: env.OBJECT_STORE_FORCE_PATH_STYLE === 'true',
  };
}
