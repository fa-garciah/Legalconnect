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
import { createHash } from 'node:crypto';
import { demoClients } from './clients';
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
 * Documents that read like a firm's own
 * ----------------------------------------------------------------------- */

/** One line of a page: its text, its size in points, and whether it is set in bold. */
interface PdfLine {
  readonly text: string;
  readonly size: number;
  readonly bold?: boolean;
  /** Extra space above the line, in points. */
  readonly before?: number;
  readonly align?: 'left' | 'center' | 'right';
}

/** Greedy word wrap at a character budget — Helvetica at 10.5pt fits ~95 per A4 line. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line.length > 0 && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line.length > 0 ? `${line} ${word}` : word;
    }
  }
  if (line.length > 0) out.push(line);
  return out;
}

const pdfEscape = (text: string): string => text.replace(/[\\()]/g, (c) => `\\${c}`);

/**
 * An A4 PDF, one page or more, with real paragraphs in WinAnsi (so accents and "ñ" render).
 *
 * Same construction as `minimalPdf` — offsets computed from the bytes emitted — but laid out
 * as a filing: a court heading, the matter's numbers, a title and the body.
 */
export function legalPdf(lines: readonly PdfLine[]): Buffer {
  const pageHeight = 842;
  const top = 780;
  const bottom = 70;
  const pages: string[] = [];
  let content = '';
  let y = top;
  for (const line of lines) {
    const step = line.size * 1.45 + (line.before ?? 0);
    if (y - step < bottom) {
      pages.push(content);
      content = '';
      y = top;
    }
    y -= step;
    const approxWidth = line.text.length * line.size * 0.5;
    const x =
      line.align === 'center'
        ? Math.max(60, (595 - approxWidth) / 2)
        : line.align === 'right'
          ? Math.max(60, 535 - approxWidth)
          : 60;
    content += `BT /${line.bold ? 'F2' : 'F1'} ${line.size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfEscape(line.text)}) Tj ET\n`;
  }
  pages.push(content);

  // Objects: 1 catalog, 2 pages, 3 font, 4 bold font, then (page, contents) per page.
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '', // filled once the page ids are known
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  const kids: string[] = [];
  for (const pageContent of pages) {
    const pageId = objects.length + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Contents ${pageId + 1} 0 R ` +
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>',
    );
    const bytes = Buffer.byteLength(pageContent, 'latin1');
    objects.push(`<< /Length ${bytes} >>\nstream\n${pageContent}endstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const startxref = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, 'latin1');
}

/**
 * A scanned page: off-white paper, rows of grey "type", a blue court stamp and a signature
 * stroke. At list and preview size it reads as a stamped acuse on a desk, which a flat
 * 24×24 colour block never did.
 */
export function scanPng(variant: number): Buffer {
  const width = 620;
  const height = 800;
  const rgb = Buffer.alloc(width * height * 3);
  const set = (x: number, y: number, r: number, g: number, b: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = (y * width + x) * 3;
    rgb[p] = r;
    rgb[p + 1] = g;
    rgb[p + 2] = b;
  };
  let seed = (variant * 2654435761 + 12345) >>> 0;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Paper, with a faint warm tint and scanner noise.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n = Math.floor(rand() * 6);
      set(x, y, 246 - n, 243 - n, 234 - n);
    }
  }
  const box = (x0: number, y0: number, w: number, h: number, shade: number): void => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) set(x, y, shade, shade, shade + 4);
    }
  };
  // Heading, centred.
  box(170, 60, 280, 9, 70);
  box(210, 78, 200, 7, 95);
  // Body: lines of type in word-sized runs.
  let y = 130;
  while (y < 600) {
    let x = 60;
    const end = rand() < 0.15 ? 60 + Math.floor(rand() * 300) : 560;
    while (x < end) {
      const word = 12 + Math.floor(rand() * 48);
      box(x, y, Math.min(word, end - x), 5, 105 + Math.floor(rand() * 30));
      x += word + 6;
    }
    y += rand() < 0.12 ? 26 : 14;
  }
  // The stamp: a blue double ring with a bar across, slightly off-round as stamps are.
  const cx = 430 + Math.floor(rand() * 40);
  const cy = 680;
  for (let a = 0; a < 3600; a += 1) {
    const t = (a / 3600) * Math.PI * 2;
    for (const radius of [62, 63, 64, 50, 51]) {
      set(Math.round(cx + Math.cos(t) * radius * 1.05), Math.round(cy + Math.sin(t) * radius), 52, 78, 160);
    }
  }
  for (let x = cx - 44; x < cx + 44; x += 1) {
    for (let dy = -4; dy <= 4; dy += 1) if (rand() < 0.8) set(x, cy + dy, 60, 86, 168);
  }
  // A signature stroke over a line.
  for (let x = 80; x < 260; x += 1) {
    const sy = 690 + Math.round(Math.sin(x / 9) * 12 + Math.sin(x / 23) * 8);
    for (let d = 0; d < 2; d += 1) set(x, sy + d, 30, 40, 90);
  }
  box(70, 720, 200, 1, 80);

  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let row = 0; row < height; row += 1) {
    raw[row * (1 + width * 3)] = 0;
    rgb.copy(raw, row * (1 + width * 3) + 1, row * width * 3, (row + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const LAW_BY_TYPE: Readonly<Record<string, string>> = {
  Mercantil: 'los artículos 1049, 1055, 1061 y demás relativos del Código de Comercio',
  Civil:
    'los artículos 255, 256 y demás aplicables del Código de Procedimientos Civiles para la Ciudad de México',
  Laboral: 'los artículos 870, 871, 872 y demás relativos de la Ley Federal del Trabajo',
  Familiar:
    'los artículos 940, 941 y demás aplicables del Código de Procedimientos Civiles para la Ciudad de México',
  Amparo: 'los artículos 1, 5, 17, 107 y demás relativos de la Ley de Amparo',
  Penal: 'los artículos 109, 110 y demás aplicables del Código Nacional de Procedimientos Penales',
};

const COUNTERPARTIES = [
  'Arrendadora Monte Albán, S.A. de C.V.',
  'Grupo Financiero Lerma, S.A.',
  'Logística Integral del Centro, S.A. de C.V.',
  'Roberto Carlos Íñiguez Salas',
  'Desarrollos Habitacionales Tepeyac, S.A. de C.V.',
  'Patricia Elena Robles Cárdenas',
  'Servicios Corporativos Anáhuac, S.C.',
  'Importadora Bahía Dorada, S.A. de C.V.',
];

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function longDate(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number) as [number, number, number];
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

interface FilingContext {
  readonly client: string;
  readonly other: string;
  readonly type: string;
  readonly law: string;
  readonly amount: string;
}

/** The paragraphs a document of this kind would carry. Generic enough to be true of any matter. */
function bodyFor(kind: string, ctx: FilingContext): string[] {
  const { client, other, law, amount } = ctx;
  const type = ctx.type.toLowerCase();
  switch (kind) {
    case 'Escrito inicial de demanda':
      return [
        `${client}, por conducto de su apoderado legal, señalando como domicilio para oír y recibir notificaciones el ubicado en Avenida Insurgentes Sur número 1605, piso 9, colonia San José Insurgentes, alcaldía Benito Juárez, ante Usted con el debido respeto comparezco para exponer:`,
        `Que por medio del presente escrito y con fundamento en ${law}, vengo a promover juicio en la vía ${type} en contra de ${other}, de quien se reclaman las siguientes prestaciones:`,
        `A. El pago de la cantidad de ${amount} por concepto de suerte principal. B. El pago de los intereses moratorios generados y que se sigan generando hasta la total solución del adeudo. C. El pago de los gastos y costas que el presente juicio origine.`,
        'Fundo la presente demanda en los hechos y consideraciones de derecho que a continuación se exponen, y ofrezco desde este momento las pruebas que se relacionan en el capítulo correspondiente.',
      ];
    case 'Contestación de demanda':
      return [
        `${client}, dentro del término concedido para tal efecto, vengo a dar contestación a la demanda instaurada en contra de mi representada por ${other}, en los siguientes términos:`,
        'Niego que la parte actora tenga acción y derecho para reclamar las prestaciones señaladas en su escrito inicial, toda vez que los hechos en que las funda son falsos en la forma y términos en que se narran.',
        'Opongo desde este momento las excepciones de falta de acción y de derecho, de pago y la de prescripción, mismas que se acreditarán en el momento procesal oportuno.',
      ];
    case 'Auto admisorio':
      return [
        `Se tiene por presentado a ${client} por conducto de su apoderado legal, con su escrito y anexos que acompaña, promoviendo juicio en la vía ${type} en contra de ${other}.`,
        `Con fundamento en ${law}, se admite la demanda en la vía y forma propuestas. Con las copias simples exhibidas, córrase traslado y emplácese a la parte demandada para que dentro del término de quince días produzca su contestación.`,
        'Se tiene por señalado domicilio para oír y recibir notificaciones y por autorizadas a las personas que se indican. NOTIFÍQUESE.',
      ];
    case 'Sentencia de primera instancia':
      return [
        `VISTOS para resolver en definitiva los autos del juicio ${type} promovido por ${client} en contra de ${other}, y`,
        'RESULTANDO. Primero. Mediante escrito presentado ante la Oficialía de Partes Común, la parte actora demandó las prestaciones que quedaron precisadas en el auto admisorio. Segundo. Emplazada la demandada, se desahogaron las pruebas ofrecidas y se formularon alegatos.',
        'CONSIDERANDO. Este juzgado es competente para conocer y resolver el presente asunto. Del análisis de las constancias de autos se desprende que la parte actora acreditó los elementos de su acción.',
        'RESUELVE. Primero. Ha procedido la vía intentada. Segundo. Se condena a la parte demandada al cumplimiento de las prestaciones reclamadas. Tercero. NOTIFÍQUESE PERSONALMENTE.',
      ];
    case 'Recurso de revocación':
      return [
        `${client}, con la personalidad que tengo debidamente reconocida en autos, vengo a interponer recurso de revocación en contra del último auto dictado en el presente juicio.`,
        'El auto recurrido causa agravio a mi representada al no valorar las constancias exhibidas oportunamente, en contravención al principio de congruencia.',
        'Por lo expuesto, solicito se revoque el auto impugnado y se dicte otro en el que se tengan por admitidas las pruebas ofrecidas.',
      ];
    case 'Dictamen pericial':
      return [
        `El suscrito perito, designado por la parte que representa a ${client}, rinde el presente dictamen en relación con los puntos sometidos a su consideración.`,
        'Metodología. Se realizó el análisis de la documentación contable exhibida, así como la inspección de los registros correspondientes al periodo controvertido.',
        `Conclusiones. Primera. De la revisión practicada se determina un saldo insoluto a cargo de ${other} por la cantidad de ${amount}. Segunda. Los registros examinados son consistentes con los estados de cuenta exhibidos.`,
      ];
    case 'Contrato de prestación de servicios':
    case 'Convenio de pago':
      return [
        `Que celebran por una parte ${client}, y por la otra ${other}, al tenor de las siguientes declaraciones y cláusulas:`,
        'DECLARACIONES. Las partes declaran contar con la capacidad legal suficiente para obligarse en los términos del presente instrumento, y que es su voluntad celebrarlo.',
        `CLÁUSULAS. Primera. Objeto. Las partes convienen en las obligaciones que se precisan en el presente instrumento. Segunda. Contraprestación. Se pacta la cantidad de ${amount}, pagadera en las fechas y forma convenidas. Tercera. Jurisdicción. Para la interpretación y cumplimiento del presente, las partes se someten a los tribunales de la Ciudad de México.`,
      ];
    case 'Poder notarial':
      return [
        `En la Ciudad de México, ante mí, Licenciado Arturo Benítez Mora, Notario Público número 214, comparece ${client} y otorga PODER GENERAL PARA PLEITOS Y COBRANZAS a favor de los abogados del despacho.`,
        'El poder se otorga con todas las facultades generales y aun las especiales que requieran cláusula especial conforme a la ley, en los términos del artículo 2554 del Código Civil Federal y sus correlativos.',
      ];
    default:
      return [
        `${client}, con la personalidad que tengo reconocida en los autos del expediente al rubro indicado, ante Usted respetuosamente comparezco y expongo:`,
        `Que por medio del presente escrito exhibo la documentación que se relaciona, a fin de que obre en autos y surta los efectos legales conducentes en el juicio seguido en contra de ${other}.`,
        'Por lo expuesto, atentamente pido se me tenga por presentado en los términos de este escrito y se acuerde de conformidad lo solicitado.',
      ];
  }
}

/** The lines of a filing for one matter. Derived from the slot and kind, never from the RNG. */
function filingLines(
  kindName: string,
  matter: DemoMatter,
  client: string,
  lawyer: string,
  day: string,
): PdfLine[] {
  const digest = createHash('sha256').update(`demo-doc-${matter.slot}-${kindName}`).digest();
  const other = COUNTERPARTIES[(digest[0] as number) % COUNTERPARTIES.length] as string;
  const amount = `$${(150_000 + (digest.readUInt32BE(1) % 4_850_000)).toLocaleString('en-US')}.00 M.N.`;
  const law = LAW_BY_TYPE[matter.matterTypeName] ?? (LAW_BY_TYPE.Civil as string);
  const lines: PdfLine[] = [
    { text: matter.venueName.toUpperCase(), size: 9.5, bold: true, align: 'center' },
    { text: `Expediente: ${matter.venueCaseReference}`, size: 10, align: 'right', before: 14 },
    { text: `Juicio ${matter.matterTypeName.toLowerCase()}`, size: 10, align: 'right' },
    { text: `${client} vs. ${other}`, size: 10, align: 'right' },
    { text: `Control interno: ${matter.fileNumber}`, size: 9, align: 'right' },
    { text: kindName.toUpperCase(), size: 12, bold: true, align: 'center', before: 22 },
  ];
  const paragraphs = bodyFor(kindName, { client, other, type: matter.matterTypeName, law, amount });
  for (const [index, paragraph] of paragraphs.entries()) {
    for (const [i, text] of wrap(paragraph, 92).entries()) {
      lines.push({ text, size: 10.5, before: i === 0 ? (index === 0 ? 16 : 8) : 0 });
    }
  }
  lines.push({ text: `Ciudad de México, a ${longDate(day)}.`, size: 10.5, before: 22 });
  lines.push({ text: 'PROTESTO LO NECESARIO', size: 10.5, bold: true, align: 'center', before: 34 });
  lines.push({ text: '______________________________', size: 10.5, align: 'center', before: 40 });
  lines.push({ text: `Lic. ${lawyer}`, size: 10.5, align: 'center' });
  return lines;
}

const shortDate = (isoDay: string): string => {
  const [y, m, d] = isoDay.split('-');
  return `${d}-${m}-${y}`;
};

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
  { name: 'Cédula de notificación', category: 'Evidencia' },
  { name: 'Constancia de notificación electrónica', category: 'Evidencia' },
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
  const clients = demoClients(firm);
  const nameOf = new Map(DEMO_PEOPLE.map((p) => [p.slug, p.name]));
  const partnerName = DEMO_PEOPLE.find((p) => p.archetype === 'MP')?.name ?? firm.name;

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
        // Drawn even when the span is zero — a conditional draw made the stream depend on the day.
        new Date(opened.getTime() + intBetween(next, 0, span) * 24 * 60 * 60 * 1000),
      );

      // A couple of withdrawn documents, so 021's withdrawn list and restore control have a
      // fixture at last — but only on the full firm, and only twice.
      const withdrawn = !firm.sparse && withdrawnCount < 2 && next() < 0.03;
      if (withdrawn) withdrawnCount += 1;

      // A filing that names its court, numbers and parties, signed by the matter's lead; a
      // scan that looks like a stamped page. Named the way a lawyer saves a file: kind and date.
      const client = clients[matter.clientIndex]?.legalName ?? firm.name;
      const lawyer = nameOf.get(matter.leadSlug ?? '') ?? partnerName;
      const body = isPdf
        ? legalPdf(filingLines(kind.name, matter, client, lawyer, uploadedOn))
        : scanPng(matterIndex * 7 + i);

      documents.push({
        matterFileNumber: matter.fileNumber,
        categoryName: category,
        originalFilename: `${kind.name} ${shortDate(uploadedOn)}.${isPdf ? 'pdf' : 'png'}`,
        mimeType: isPdf ? 'application/pdf' : 'image/png',
        status: withdrawn ? 'withdrawn' : 'active',
        uploadedBySlug: pick(next, uploaders),
        uploadedOn,
        sizeBytes: body.length,
        body,
        // Keyed on the matter's date-free slot, never its file number (see DemoMatter.slot).
        storageKeyParts: ['document', firm.rfc, matter.slot, String(i)],
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
