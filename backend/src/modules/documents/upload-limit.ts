/**
 * 021 Decision 4. The largest single upload the API accepts.
 *
 * `DOCUMENT_MAX_UPLOAD_BYTES`, default 25 MB. Read when the upload interceptor is built (app
 * start), not per request. A missing or malformed value falls back to the default rather than to
 * "no limit": the failure that matters here is an unbounded upload, not a slightly-wrong one.
 */
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileTooLarge } from '../../common/http/errors';

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function maxUploadBytes(): number {
  const configured = Number(process.env.DOCUMENT_MAX_UPLOAD_BYTES);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
}

/**
 * Whether a file of `bytes` is over the cap. The ONE statement of the boundary: a file of exactly
 * `maxUploadBytes()` is accepted, one byte more is refused (021 Decision 4).
 */
export function exceedsUploadCap(bytes: number): boolean {
  return bytes > maxUploadBytes();
}

/**
 * Multer options whose `limits` is evaluated when Nest constructs the interceptor, so a test (or
 * a deployment) can set the variable before the app is created.
 *
 * **`+ 1`, and why.** Multer (through busboy) treats a file as over `fileSize` the moment it
 * REACHES it, so `fileSize: max` refused a file of exactly `max` bytes — measured 2026-10-09: 1023
 * bytes accepted, 1024 refused with a 1024-byte cap. Handing multer `max + 1` makes its own refusal
 * fire at `max + 1` bytes, which is the first size the product means to refuse; it still stops
 * reading at that point, so an oversized upload is never buffered whole. The controller re-checks
 * with `exceedsUploadCap`, so the boundary does not depend on a library's off-by-one either way.
 */
export const uploadOptions = {
  get limits() {
    return { fileSize: maxUploadBytes() + 1, files: 1 };
  },
};

/**
 * Multer's size refusal reaches Nest as `PayloadTooLargeException` with Nest's own body shape,
 * which `016a`'s classifier cannot read. Scoped to the upload route only, this rewrites it as
 * `FileTooLarge` — the product's `{ error: { code, message } }` shape.
 */
@Catch(PayloadTooLargeException)
export class UploadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const refusal = new FileTooLarge(maxUploadBytes());
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();
    response.status(refusal.getStatus()).json(refusal.getResponse());
  }
}
