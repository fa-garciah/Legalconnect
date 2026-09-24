/**
 * The bucket's own region wins over OBJECT_STORE_REGION on real AWS.
 *
 * Found pointing the app at a real bucket: configured `us-east-1`, bucket in `eu-central-1`, every
 * request a `PermanentRedirect` — and a presigned preview/download URL signed for the wrong region
 * would fail in the browser even if ordinary requests were redirected. Here AWS's 301 is simulated
 * (no network): the store must sign URLs for the region the 301 names.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { S3ObjectStore } from '../../src/common/storage/object-store/s3-object-store';

const CONFIG = {
  region: 'us-east-1',
  bucket: 'some-bucket',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};

function redirectTo(region: string) {
  return vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(
    Object.assign(new Error('Moved'), { $response: { headers: { 'x-amz-bucket-region': region } } }),
  );
}

describe('S3ObjectStore region discovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('signs URLs for the region AWS reports, not the configured one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    redirectTo('eu-central-1');
    const { url } = await new S3ObjectStore(CONFIG).presignGet('tenant/t/case/c/d');
    expect(new URL(url).host).toContain('eu-central-1');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('using eu-central-1'));
  });

  it('keeps the configured region when AWS agrees', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({ BucketRegion: 'us-east-1' } as never);
    const { url } = await new S3ObjectStore(CONFIG).presignGet('k');
    expect(new URL(url).host).not.toContain('eu-central-1');
  });

  it('asks AWS only once', async () => {
    const send = redirectTo('eu-central-1');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new S3ObjectStore(CONFIG);
    await store.presignGet('a');
    await store.presignGet('b');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never probes a custom endpoint (MinIO): regions there are nominal', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send');
    await new S3ObjectStore({ ...CONFIG, endpoint: 'http://localhost:9000', forcePathStyle: true }).presignGet('k');
    expect(send).not.toHaveBeenCalled();
  });
});
