/**
 * 021 T015. What the upload control accepts, checked before sending.
 *
 * A mirror of `007`'s `backend/src/modules/documents/upload-validation.ts` (the MIME allow-list and
 * the extension deny-list) and of 021's 25 MB cap (`DOCUMENT_MAX_UPLOAD_BYTES`). The server
 * decides; this only spares a person an upload that would be refused. `upload-rules.test.ts`
 * reads the backend file and fails if the two lists drift.
 */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
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

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** For `<input type="file" accept>`: the MIME types plus their usual extensions. */
export const ACCEPT_ATTRIBUTE = [
  ...ALLOWED_MIME_TYPES,
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
].join(',');

/** Human list for the refusal copy. */
export const ACCEPTED_TYPES_LABEL = 'PDF, imágenes (PNG, JPG, GIF, WebP), texto, Word, Excel o PowerPoint';

export type UploadCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'type' | 'size' | 'empty' };

export function checkUpload(file: { readonly name: string; readonly type: string; readonly size: number }): UploadCheck {
  const dot = file.name.lastIndexOf('.');
  const extension = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
  if (DISALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, reason: 'type' };
  }
  if (file.size === 0) return { ok: false, reason: 'empty' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'size' };
  return { ok: true };
}
