/**
 * T021, T023 — the firm's documents, and the bytes behind them. 022/FR-008, FR-009, FR-010.
 *
 * The finding this slice exists to fix is in `seed.ts:407-414`: "no bytes are written to
 * object storage, only the metadata row". `021` shipped preview and download, and neither can
 * be seen working against a row whose object does not exist. So these documents carry real
 * bytes, and the bytes have to be genuinely valid — a PDF the browser refuses to render is
 * indistinguishable, from the screen, from a preview feature that does not work.
 *
 * The file-type assertion goes through `assertUploadAllowed`, the product's OWN gate, rather
 * than through a copy of its MIME list. A copy would let the two drift, and a fixture the real
 * upload path would have refused is a fixture that proves nothing.
 */
import { describe, expect, it } from 'vitest';
import { assertUploadAllowed } from '../../src/modules/documents/upload-validation';
import { buildObjectKey } from '../../src/common/storage/object-store/object-store.port';
import { DEMO_CATEGORIES_EXTRA, DEMO_FIRMS, DEMO_PEOPLE } from '../../drizzle/demo/firm';
import { demoMatters } from '../../drizzle/demo/matters';
import { demoDocuments, minimalPdf, minimalPng } from '../../drizzle/demo/documents';
import { deterministicUuid } from '../../drizzle/demo/deterministic-id';
import { DEFAULT_DOCUMENT_CATEGORIES } from '../../src/modules/documents/categories/document-category.seed';

const AS_OF = new Date('2026-09-25T00:00:00Z');
const full = DEMO_FIRMS[0]!;
const matters = demoMatters(full, AS_OF);
const documents = demoDocuments(full, matters, AS_OF);

describe('minimalPdf', () => {
  const pdf = minimalPdf('EXP-2026-2001 · Demanda inicial');

  it('is a real PDF, not a text file with a .pdf name', () => {
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('carries the structure a renderer needs: a catalog, a page and an xref', () => {
    const text = pdf.toString('latin1');
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Type /Page');
    expect(text).toContain('xref');
    expect(text).toContain('trailer');
    expect(text).toMatch(/startxref\s+\d+/);
  });

  it('declares byte offsets that actually point at their objects', () => {
    // The one way a hand-built PDF is subtly broken: an xref table whose offsets are wrong.
    // A reader that trusts the table then finds garbage where object 1 should be.
    const text = pdf.toString('latin1');
    const startxref = Number(/startxref\s+(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n\s*$/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThanOrEqual(5);
    for (const [index, offset] of offsets.entries()) {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj`), `object ${index + 1}`).toBe(true);
    }
  });

  it('embeds the title it was given, so a previewed document is identifiable', () => {
    expect(pdf.toString('latin1')).toContain('EXP-2026-2001');
  });

  it('stays small and is deterministic', () => {
    expect(pdf.length).toBeLessThan(4096);
    expect(minimalPdf('same')).toEqual(minimalPdf('same'));
    expect(minimalPdf('a')).not.toEqual(minimalPdf('b'));
  });
});

describe('minimalPng', () => {
  const png = minimalPng(3);

  it('carries the PNG signature and the three mandatory chunks', () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const text = png.toString('latin1');
    expect(text).toContain('IHDR');
    expect(text).toContain('IDAT');
    expect(text.endsWith('IEND®B`\u0082')).toBe(true);
  });

  it('has a CRC on every chunk that verifies', () => {
    // A PNG with a wrong CRC is rejected outright by most decoders, so this is the
    // difference between "a file" and "an image".
    let offset = 8;
    let chunks = 0;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.subarray(offset + 4, offset + 8);
      const body = png.subarray(offset + 8, offset + 8 + length);
      const stated = png.readUInt32BE(offset + 8 + length);
      const computed = crc32(Buffer.concat([type, body]));
      expect(stated, `CRC of ${type.toString('latin1')}`).toBe(computed);
      offset += 12 + length;
      chunks += 1;
    }
    expect(chunks).toBe(3);
  });

  it('stays small and is deterministic', () => {
    expect(png.length).toBeLessThan(4096);
    expect(minimalPng(3)).toEqual(minimalPng(3));
    expect(minimalPng(3)).not.toEqual(minimalPng(4));
  });
});

/** An independent CRC32, so the test is not checking the implementation against itself. */
function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('the document set (FR-008)', () => {
  it('is about 130 documents', () => {
    expect(documents.length).toBeGreaterThanOrEqual(120);
    expect(documents.length).toBeLessThanOrEqual(140);
  });

  it('is deterministic', () => {
    expect(demoDocuments(full, matters, AS_OF).map((d) => d.storageKeyParts)).toEqual(
      documents.map((d) => d.storageKeyParts),
    );
  });

  it('spreads them unevenly, and leaves some matters empty', () => {
    const perMatter = new Map<string, number>();
    for (const document of documents) {
      perMatter.set(document.matterFileNumber, (perMatter.get(document.matterFileNumber) ?? 0) + 1);
    }
    expect(Math.max(...perMatter.values())).toBeLessThan(documents.length / 4);
    expect(matters.length - perMatter.size).toBeGreaterThanOrEqual(3);
  });

  it('includes at least one withdrawn document', () => {
    // 021's Decision 2 built a withdrawn list and a restore control with no fixture behind it.
    expect(documents.filter((d) => d.status === 'withdrawn').length).toBeGreaterThanOrEqual(1);
  });

  it('files everything under a category the firm has', () => {
    const available = new Set<string>([...DEFAULT_DOCUMENT_CATEGORIES, ...DEMO_CATEGORIES_EXTRA]);
    for (const document of documents) expect(available).toContain(document.categoryName);
  });

  it('uses the firm\'s own litigation categories, not only the defaults', () => {
    const used = new Set(documents.map((d) => d.categoryName));
    expect([...DEMO_CATEGORIES_EXTRA].some((c) => used.has(c))).toBe(true);
  });

  it('is uploaded by people who hold document.upload', () => {
    // matrix.ts: MP, AA, PL, CM, SA — never BM.
    const allowed = new Set(
      DEMO_PEOPLE.filter((p) => p.archetype !== 'BM').map((p) => p.slug),
    );
    for (const document of documents) expect(allowed).toContain(document.uploadedBySlug);
  });

  it('never predates the matter it belongs to', () => {
    const openedBy = new Map(matters.map((m) => [m.fileNumber, m.openedOn]));
    for (const document of documents) {
      expect(document.uploadedOn >= (openedBy.get(document.matterFileNumber) as string)).toBe(true);
    }
  });
});

describe('every document would survive the real upload path (FR-009)', () => {
  it('passes the product\'s own file-type gate', () => {
    for (const document of documents) {
      expect(() => assertUploadAllowed(document.originalFilename, document.mimeType)).not.toThrow();
    }
  });

  it('declares a size equal to the bytes it carries', () => {
    for (const document of documents) {
      expect(document.sizeBytes, document.originalFilename).toBe(document.body.length);
      expect(document.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('stays under the 25 MB upload cap 021 introduced', () => {
    for (const document of documents) expect(document.sizeBytes).toBeLessThan(25 * 1024 * 1024);
  });

  it('names a storage key buildObjectKey would produce', () => {
    const tenantId = deterministicUuid('tenant', full.rfc);
    for (const document of documents) {
      const caseId = deterministicUuid('case', full.rfc, document.matterFileNumber);
      const documentId = deterministicUuid(...document.storageKeyParts);
      expect(() => buildObjectKey(tenantId, caseId, documentId)).not.toThrow();
    }
  });

  it('gives every document a distinct key', () => {
    const keys = documents.map((d) => deterministicUuid(...d.storageKeyParts));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives Spanish filenames with an extension matching the type', () => {
    for (const document of documents) {
      if (document.mimeType === 'application/pdf') expect(document.originalFilename).toMatch(/\.pdf$/);
      if (document.mimeType === 'image/png') expect(document.originalFilename).toMatch(/\.png$/);
      expect(document.originalFilename).not.toMatch(/\b(the|and|of|for|file|document)\b/i);
    }
  });
});
