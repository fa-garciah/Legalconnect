/**
 * T022 — the firm's documents, and real bytes to put behind them.
 * 022/FR-008, FR-009, FR-010, Decision 4.
 *
 * `seed.ts:407-414` says it plainly about the existing fixture: "no bytes are written to
 * object storage, only the metadata row". `021` shipped preview and download against exactly
 * that, so neither has ever been seen working on seeded data. These documents carry bytes.
 *
 * THE BYTES ARE CONSTRUCTED, NOT COMMITTED (Decision 4). No binary enters the repository,
 * every file is a few hundred bytes, and `size_bytes` is measured from the buffer actually
 * written rather than declared and hoped for. They are valid — a PDF with a correct xref
 * table and a PNG with correct CRCs — because a file a decoder rejects is indistinguishable,
 * from the screen, from a preview feature that does not work.
 *
 * They are deliberately NOT plausible legal documents. A convincing fake pleading in a demo
 * database is a liability; each PDF says what it is and which matter it belongs to.
 */
import { deflateSync } from 'node:zlib';
import { DEFAULT_DOCUMENT_CATEGORIES } from '../../src/modules/documents/categories/document-category.seed';
import { DEMO_CATEGORIES_EXTRA, DEMO_PEOPLE, type DemoFirm } from './firm';
import type { DemoMatter } from './matters';
import { DEMO_SEED, intBetween, mulberry32, pick } from './rng';

export interface DemoDocument {
  readonly matterFileNumber: string;
  readonly categoryName: string;
  readonly originalFilename: string;
  readonly mimeType: 'application/pdf' | 'image/png';
  readonly status: 'active' | 'withdrawn';
  readonly uploadedBySlug: string;
  /** `YYYY-MM-DD`; the row's `uploaded_at` is this day at noon UTC. */
  readonly uploadedOn: string;
  readonly sizeBytes: number;
  readonly body: Buffer;
  /**
   * The parts `deterministicUuid` takes to produce this document's id — and therefore its
   * `storage_key`. Passed around rather than the id itself so the caller can see what the id
   * is derived FROM, which is the whole idempotency argument (Decision 5).
   */
  readonly storageKeyParts: readonly [string, ...string[]];
}

/* --------------------------------------------------------------------------
 * PDF
 * ----------------------------------------------------------------------- */

/**
 * A single-page PDF with a line of text, an xref table whose offsets are computed from the
 * bytes actually emitted, and a trailer.
 *
 * The offsets are the part worth care: a hand-built PDF with a wrong xref opens in some
 * readers and fails in others, which is the worst possible outcome for a preview fixture.
 * `demo-documents.test.ts` re-derives every offset from the output and checks it points at
 * its object.
 */
export function minimalPdf(title: string): Buffer {
  const safe = title.replace(/[\\()]/g, ' ');
  const content = `BT /F1 11 Tf 40 120 Td (${safe}) Tj 0 -20 Td (Documento de demostracion - LegalConnect MX) Tj ET\n`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 160] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const startxref = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(body + xref + trailer, 'latin1');
}

/* --------------------------------------------------------------------------
 * PNG
 * ----------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/**
 * A 24×24 RGB PNG in one flat colour chosen by `variant`.
 *
 * `zlib` is a Node builtin, so nothing is added to the manifest — `no-new-dependency.test.ts`
 * holds an exact baseline and this slice must not move it.
 */
export function minimalPng(variant: number): Buffer {
  const size = 24;
  const r = (37 + variant * 53) % 256;
  const g = (91 + variant * 29) % 256;
  const b = (163 + variant * 17) % 256;

  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0; // filter type 0 — no filtering
    for (let x = 0; x < size; x += 1) {
      const p = rowStart + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 — truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------------------
 * The set
 * ----------------------------------------------------------------------- */

/** Spanish document names, paired with the category a firm would file them under. */
const PDF_KINDS: readonly { readonly name: string; readonly category: string }[] = [
  { name: 'Escrito inicial de demanda', category: 'Demanda' },
  { name: 'Contestación de demanda', category: 'Contestación' },
  { name: 'Auto admisorio', category: 'Resolución' },
  { name: 'Sentencia de primera instancia', category: 'Resolución' },
  { name: 'Recurso de revocación', category: 'Recurso' },
  { name: 'Dictamen pericial', category: 'Dictamen' },
  { name: 'Contrato de prestación de servicios', category: 'Contrato' },
  { name: 'Convenio de pago', category: 'Contrato' },
  { name: 'Oficio al juzgado', category: 'Correspondencia' },
  { name: 'Anexo de documentación soporte', category: 'Anexo' },
  { name: 'Poder notarial', category: 'Anexo' },
  { name: 'Acuse de recibo', category: 'Correspondencia' },
];

const PNG_KINDS: readonly { readonly name: string; readonly category: string }[] = [
  { name: 'Acuse sellado', category: 'Evidencia' },
  { name: 'Fotografía del inmueble', category: 'Evidencia' },
  { name: 'Captura de pantalla del portal', category: 'Evidencia' },
  { name: 'Comprobante de notificación', category: 'Evidencia' },
];

const KNOWN_CATEGORIES = new Set<string>([...DEFAULT_DOCUMENT_CATEGORIES, ...DEMO_CATEGORIES_EXTRA]);

const iso = (date: Date): string => date.toISOString().slice(0, 10);

export function demoDocuments(
  firm: DemoFirm,
  matters: readonly DemoMatter[],
  asOf: Date,
): readonly DemoDocument[] {
  const next = mulberry32(DEMO_SEED + 977 + (firm.sparse ? 3 : 0));

  // Everybody who holds `document.upload` in matrix.ts: MP, AA, PL, CM, SA — never BM.
  const uploaders = DEMO_PEOPLE.filter((p) => p.archetype !== 'BM').map((p) => p.slug);

  /**
   * THE TOTAL IS STATED, NOT EMERGENT — and that is a correction worth recording.
   *
   * The first version drew a count per matter from weighted tiers and hoped the sum landed
   * near 130. It does not behave the way tuning expects: changing any tier shifts the whole
   * RNG stream, so the total jumps around (99 → 191 → 185 across three attempts) instead of
   * moving with the change. A generator whose output volume cannot be predicted from its
   * source is a generator nobody can maintain.
   *
   * So each matter gets a WEIGHT, and the target is distributed across those weights by
   * largest remainder. The spread stays uneven — which is what `015` and `023` read — while
   * the total is exactly what the spec asked for.
   */
  const target = firm.sparse ? 5 : 130;

  const weights: number[] = matters.map((_, matterIndex) => {
    const roll = next();
    // A few matters hold nothing at all: a firm-wide list where every matter has documents
    // looks generated, and `023`'s empty-state is unreachable without one.
    if (!firm.sparse && matterIndex % 11 === 5) return 0;
    if (firm.sparse) return roll < 0.3 ? 0 : 1;
    return roll < 0.15 ? 4 : roll < 0.6 ? 2 : 1;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const exact = weights.map((w) => (totalWeight === 0 ? 0 : (target * w) / totalWeight));
  const counts = exact.map((value) => Math.floor(value));
  // Largest remainder, so the drift lands on the matters that were closest to rounding up
  // rather than always on the first one.
  const remainders = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  let shortfall = target - counts.reduce((sum, c) => sum + c, 0);
  for (const { index } of remainders) {
    if (shortfall <= 0) break;
    if (weights[index] === 0) continue;
    counts[index] = (counts[index] as number) + 1;
    shortfall -= 1;
  }

  const documents: DemoDocument[] = [];
  let withdrawnCount = 0;

  for (const [matterIndex, matter] of matters.entries()) {
    const count = counts[matterIndex] as number;

    for (let i = 0; i < count; i += 1) {
      const isPdf = next() < 0.62;
      const kind = isPdf ? pick(next, PDF_KINDS) : pick(next, PNG_KINDS);
      const category = KNOWN_CATEGORIES.has(kind.category) ? kind.category : 'Sin clasificar';

      // Uploaded between the matter opening and today — never before it existed.
      const opened = new Date(`${matter.openedOn}T00:00:00Z`);
      const span = Math.max(
        0,
        Math.floor((asOf.getTime() - opened.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const uploadedOn = iso(
        new Date(opened.getTime() + (span === 0 ? 0 : intBetween(next, 0, span)) * 24 * 60 * 60 * 1000),
      );

      // A couple of withdrawn documents, so 021's withdrawn list and restore control have a
      // fixture at last — but only on the full firm, and only twice.
      const withdrawn = !firm.sparse && withdrawnCount < 2 && next() < 0.03;
      if (withdrawn) withdrawnCount += 1;

      const title = `${matter.fileNumber} · ${kind.name}`;
      const body = isPdf ? minimalPdf(title) : minimalPng(matterIndex * 7 + i);
      const suffix = count > 1 ? ` ${i + 1}` : '';

      documents.push({
        matterFileNumber: matter.fileNumber,
        categoryName: category,
        originalFilename: `${kind.name}${suffix}.${isPdf ? 'pdf' : 'png'}`,
        mimeType: isPdf ? 'application/pdf' : 'image/png',
        status: withdrawn ? 'withdrawn' : 'active',
        uploadedBySlug: pick(next, uploaders),
        uploadedOn,
        sizeBytes: body.length,
        body,
        storageKeyParts: ['document', firm.rfc, matter.fileNumber, String(i)],
      });
    }
  }

  // FR-008 asks for "at least one withdrawn"; the roll above can in principle produce none,
  // and a fixture that is only probably present is not a fixture. Force the last one.
  if (!firm.sparse && withdrawnCount === 0 && documents.length > 0) {
    const last = documents.length - 1;
    documents[last] = { ...(documents[last] as DemoDocument), status: 'withdrawn' };
  }

  return documents;
}
