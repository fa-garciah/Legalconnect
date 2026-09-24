/**
 * 021 T004 (Decision 4). The header a signed URL asks the object store to answer with, so a
 * download is saved under its original name rather than the storage key (a UUID, no extension).
 *
 * RFC 6266 + RFC 5987: an ASCII `filename` for old clients and a UTF-8 `filename*` for the rest.
 * The name is the uploader's, so it is untrusted: quotes, backslashes and control characters
 * (a CR/LF would split the header) never reach the value.
 */
import { describe, expect, it } from 'vitest';
import { contentDisposition } from '../../src/modules/documents/content-disposition';

describe('contentDisposition', () => {
  it('attachment with both forms for a plain ASCII name', () => {
    expect(contentDisposition('attachment', 'contrato.pdf')).toBe(
      `attachment; filename="contrato.pdf"; filename*=UTF-8''contrato.pdf`,
    );
  });

  it('inline for preview', () => {
    expect(contentDisposition('inline', 'foto.png')).toMatch(/^inline; filename="foto\.png"/);
  });

  it('keeps accents in filename* and folds them in the ASCII fallback', () => {
    const header = contentDisposition('attachment', 'Contrato Señor Pérez.pdf');
    expect(header).toContain(`filename="Contrato Senor Perez.pdf"`);
    expect(header).toContain(`filename*=UTF-8''Contrato%20Se%C3%B1or%20P%C3%A9rez.pdf`);
  });

  it('strips quotes, backslashes and CR/LF so the header cannot be split or escaped', () => {
    const hostile = 'a"b\\c\r\nSet-Cookie: x.pdf';
    expect(hostile).toContain('\\'); // the input really carries a backslash
    const header = contentDisposition('attachment', hostile);
    expect(header).not.toMatch(/[\r\n\\]/);
    expect(header).toContain(`filename="abcSet-Cookie: x.pdf"`);
  });

  it('never produces an empty name', () => {
    expect(contentDisposition('attachment', '\r\n')).toContain(`filename="documento"`);
  });

  it('percent-encodes the RFC 5987 attr-char exceptions', () => {
    expect(contentDisposition('attachment', "o'brien (1).pdf")).toContain(
      `filename*=UTF-8''o%27brien%20%281%29.pdf`,
    );
  });
});
