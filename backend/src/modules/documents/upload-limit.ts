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
 * Multer options whose `limits` is evaluated when Nest constructs the interceptor, so a test (or
 * a deployment) can set the variable before the app is created.
 */
export const uploadOptions = {
  get limits() {
    return { fileSize: maxUploadBytes(), files: 1 };
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
