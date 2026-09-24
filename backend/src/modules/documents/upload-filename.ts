/**
 * 021. The uploaded file's name as the uploader wrote it.
 *
 * Multer (through busboy) decodes the multipart `filename` parameter as latin1, but every browser
 * sends it as UTF-8 — so "Señor Pérez.pdf" arrived as "SeÃ±or PÃ©rez.pdf" and was stored that way.
 * Re-reading the latin1 string's bytes as UTF-8 recovers the real name. A name that is not valid
 * UTF-8 once re-read (a client that really did send latin1) is kept as received rather than
 * replaced with U+FFFD, so this can only ever repair a name, never damage one.
 */
export function decodeUploadFilename(received: string): string {
  const bytes = Buffer.from(received, 'latin1');
  const decoded = bytes.toString('utf8');
  if (decoded.includes('�')) return received;
  // Only re-read when the bytes round-trip: a pure-ASCII name is identical either way.
  return Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : received;
}
