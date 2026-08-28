/**
 * T020 — spec.md Decision 3's retained floor: an allowed MIME-type/extension list.
 * Ordinary input validation, not malware scanning (real content scanning is
 * deferred out of MVP scope, tracked as recognized technical debt).
 */
import { ValidationFailed } from '../../common/http/errors';

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const DISALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'dll', 'bat', 'cmd', 'sh', 'ps1', 'msi', 'com', 'scr',
  'js', 'vbs', 'jar', 'zip', 'rar', '7z', 'tar', 'gz',
]);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** Throws `ValidationFailed` (400) for a file type outside the allowed list. */
export function assertUploadAllowed(filename: string, mimeType: string): void {
  const extension = extensionOf(filename);
  if (DISALLOWED_EXTENSIONS.has(extension)) {
    throw new ValidationFailed('This file type is not allowed.');
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationFailed('This file type is not allowed.');
  }
}
