/**
 * 021 Decision 4. The `Content-Disposition` a signed URL asks the object store to answer with.
 *
 * Without it, S3/MinIO serve the object under its storage key — `tenant/…/case/…/{uuid}` — and the
 * browser saves a file with no name and no extension. The `filename` field in the download
 * response cannot fix that: a cross-origin download ignores the page's `download` attribute.
 *
 * RFC 6266 with RFC 5987's `filename*` for the real (UTF-8) name, plus an ASCII `filename` for
 * clients that ignore it. The name is the uploader's and so untrusted: control characters (a CR/LF
 * would split the header), quotes and backslashes are removed before either form is built.
 */
/** Control characters (C0 and DEL), `"` and `\` — what could split or escape the header. */
function isUnsafe(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 0x20 || code === 0x7f || char === '"' || char === '\\';
}

function sanitise(filename: string): string {
  const cleaned = [...filename].filter((c) => !isUnsafe(c)).join('').trim();
  return cleaned.length > 0 ? cleaned : 'documento';
}

/** Accents folded ("Pérez" → "Perez"); anything else outside printable ASCII becomes `_`. */
function asciiFallback(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\u0020-\u007e]/g, '_');
}

/** RFC 5987 `ext-value`: `encodeURIComponent` leaves `!'()*`, which attr-char does not allow. */
function rfc5987(name: string): string {
  return encodeURIComponent(name).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentDisposition(kind: 'attachment' | 'inline', filename: string): string {
  const name = sanitise(filename);
  return `${kind}; filename="${asciiFallback(name)}"; filename*=UTF-8''${rfc5987(name)}`;
}
