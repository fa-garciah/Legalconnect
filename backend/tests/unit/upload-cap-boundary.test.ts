/**
 * 021 Decision 4 — the upload cap's boundary, both edges. A file of exactly the cap is accepted;
 * one byte more is refused. `documents-upload-cap.test.ts` asserts the same through the real app.
 *
 * Found 2026-10-09: with `fileSize: max`, multer refused a file of exactly `max` bytes (it treats
 * reaching the limit as exceeding it). The contract test had been red on `main` since 021.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { exceedsUploadCap, maxUploadBytes, uploadOptions } from '../../src/modules/documents/upload-limit';

describe('upload cap boundary', () => {
  const saved = process.env.DOCUMENT_MAX_UPLOAD_BYTES;
  afterEach(() => {
    if (saved === undefined) delete process.env.DOCUMENT_MAX_UPLOAD_BYTES;
    else process.env.DOCUMENT_MAX_UPLOAD_BYTES = saved;
  });

  it('exactly the cap is within it; one byte more is over', () => {
    process.env.DOCUMENT_MAX_UPLOAD_BYTES = '1024';
    expect(exceedsUploadCap(1023)).toBe(false);
    expect(exceedsUploadCap(1024)).toBe(false);
    expect(exceedsUploadCap(1025)).toBe(true);
  });

  it('hands multer cap + 1, because multer refuses a file that merely REACHES its fileSize', () => {
    process.env.DOCUMENT_MAX_UPLOAD_BYTES = '1024';
    expect(uploadOptions.limits.fileSize).toBe(maxUploadBytes() + 1);
    expect(uploadOptions.limits.files).toBe(1);
  });
});
