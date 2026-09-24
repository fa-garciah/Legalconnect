/**
 * 021 T014. The upload rules the screen checks before sending — a mirror of `007`'s
 * `backend/src/modules/documents/upload-validation.ts` and 021's 25 MB cap. The server decides;
 * this only saves a round trip that would fail.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCEPT_ATTRIBUTE, ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, checkUpload } from '@/documents/upload-rules';

const file = (name: string, type: string, size = 10) => ({ name, type, size });

describe('upload rules', () => {
  it('allows exactly the MIME types 007 allows', () => {
    const backend = readFileSync(
      join(__dirname, '../../../../backend/src/modules/documents/upload-validation.ts'),
      'utf8',
    );
    const block = backend.slice(backend.indexOf('ALLOWED_MIME_TYPES'), backend.indexOf(']);'));
    const serverTypes = [...block.matchAll(/'([a-z]+\/[^']+)'/g)].map((m) => m[1]).sort();
    expect([...ALLOWED_MIME_TYPES].sort()).toEqual(serverTypes);
  });

  it('accepts a PDF', () => {
    expect(checkUpload(file('contrato.pdf', 'application/pdf'))).toEqual({ ok: true });
  });

  it.each([
    ['respaldo.zip', 'application/zip'],
    ['instalador.exe', 'application/octet-stream'],
    ['script.js', 'text/javascript'],
  ])('refuses %s', (name, type) => {
    expect(checkUpload(file(name, type))).toEqual({ ok: false, reason: 'type' });
  });

  it('refuses a disallowed extension even with an allowed MIME type', () => {
    expect(checkUpload(file('truco.exe', 'application/pdf'))).toEqual({ ok: false, reason: 'type' });
  });

  it('refuses a file over 25 MB, and accepts one at exactly 25 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expect(checkUpload(file('grande.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1))).toEqual({
      ok: false,
      reason: 'size',
    });
    expect(checkUpload(file('justo.pdf', 'application/pdf', MAX_UPLOAD_BYTES))).toEqual({ ok: true });
  });

  it('refuses an empty file', () => {
    expect(checkUpload(file('vacio.pdf', 'application/pdf', 0))).toEqual({ ok: false, reason: 'empty' });
  });

  it('offers the picker the same list', () => {
    for (const type of ALLOWED_MIME_TYPES) expect(ACCEPT_ATTRIBUTE).toContain(type);
  });
});
