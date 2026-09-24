/** 021 — multer hands over the UTF-8 filename decoded as latin1; this recovers it. */
import { describe, expect, it } from 'vitest';
import { decodeUploadFilename } from '../../src/modules/documents/upload-filename';

const asMulterSees = (name: string) => Buffer.from(name, 'utf8').toString('latin1');

describe('decodeUploadFilename', () => {
  it('recovers accents and ñ', () => {
    expect(decodeUploadFilename(asMulterSees('Contrato Señor Pérez.pdf'))).toBe('Contrato Señor Pérez.pdf');
  });

  it('leaves an ASCII name untouched', () => {
    expect(decodeUploadFilename('contrato.pdf')).toBe('contrato.pdf');
  });

  it('keeps a real latin1 name rather than corrupting it', () => {
    // "é" as a single latin1 byte (0xE9) is not valid UTF-8 on its own.
    expect(decodeUploadFilename('caf\u00e9.pdf')).toBe('caf\u00e9.pdf');
  });
});
