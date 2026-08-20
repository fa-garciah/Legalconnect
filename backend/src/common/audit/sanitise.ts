/**
 * T063 — refuses metadata that would put personal data, secrets or authentication
 * factors into the audit log. FR-012.
 *
 * This REFUSES rather than strips, deliberately. An entry is retained 24 months and is
 * readable by the firm, so it is the wrong artefact in which to discover that redaction
 * missed a field. And because the append shares the mutation's transaction (FR-017),
 * refusing also rolls the mutation back — which is the right outcome for an operation
 * that cannot be audited safely.
 *
 * The cost of that choice is real: a bug in metadata construction fails the operation
 * rather than degrading the log. That trade is taken knowingly. The data here is
 * covered by attorney-client privilege, and the constitution's rationale for Principle
 * VI is that a leak of it is not recoverable.
 *
 * Two layers, because neither is sufficient alone:
 *  - key names, which catch what we thought to look for;
 *  - value shapes, which catch contact details and tokens under innocent key names.
 */

export class SensitiveDataInAudit extends Error {
  constructor(readonly path: string, readonly why: string) {
    super(`refusing to write audit metadata: ${path} looks like ${why}`);
    this.name = 'SensitiveDataInAudit';
  }
}

/** Substrings matched case-insensitively against key names. */
const FORBIDDEN_KEY_PARTS: ReadonlyArray<readonly [string, string]> = [
  // Secrets and authentication factors.
  ['password', 'a password'],
  ['passwd', 'a password'],
  ['secret', 'a secret'],
  ['token', 'a token'],
  ['apikey', 'an API key'],
  ['api_key', 'an API key'],
  ['privatekey', 'a private key'],
  ['private_key', 'a private key'],
  ['credential', 'a credential'],
  ['totp', 'an authentication factor'],
  ['otp', 'an authentication factor'],
  ['backupcode', 'an authentication factor'],
  ['backup_code', 'an authentication factor'],
  ['csd', 'invoice-signing material'],
  ['authorization', 'an authorization header'],
  ['cookie', 'a session cookie'],

  // End-client personal data. Principle VI: never in application logs.
  ['curp', 'a CURP'],
  ['email', 'an email address'],
  ['correo', 'an email address'],
  ['phone', 'a phone number'],
  ['telefono', 'a phone number'],
  ['address', 'a postal address'],
  ['direccion', 'a postal address'],
  ['birth', 'a date of birth'],
  ['nacimiento', 'a date of birth'],
  ['clientname', 'an end-client name'],
  ['client_name', 'an end-client name'],
  ['fullname', 'a personal name'],
  ['full_name', 'a personal name'],
];

/**
 * Key names that CONTAIN a forbidden substring but are references, not data.
 * `tenantId` is fine; `clientEmail` is not.
 */
const ALLOWED_KEYS: ReadonlySet<string> = new Set(['addresscount', 'emailsent', 'tokencount']);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/;
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const CURP = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/;

/**
 * A phone number must LOOK like one — grouped with separators, or carrying the +52
 * country code. Deliberately NOT a bare run of ten or more digits.
 *
 * The first version of this matched any long digit run, which meant a timestamp, a
 * byte count or a numeric id refused the write and rolled back the mutation with it.
 * An over-broad value shape here is not a harmless false positive: because the
 * sanitiser refuses rather than strips, it becomes a denial of service on the system's
 * own writes. A bare digit run is far more often an identifier than a phone number.
 */
const MX_PHONE = /(?:\+52[\s-]?)?(?:\(\d{2,3}\)|\b\d{2,3})[\s-]\d{3,4}[\s-]\d{4}\b/;

const VALUE_SHAPES: ReadonlyArray<readonly [RegExp, string]> = [
  [PEM, 'a private key'],
  [JWT, 'a token'],
  [CURP, 'a CURP'],
  [EMAIL, 'an email address'],
  [MX_PHONE, 'a phone number'],
];

function checkKey(key: string, path: string): void {
  const normalised = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (ALLOWED_KEYS.has(normalised)) return;
  for (const [part, why] of FORBIDDEN_KEY_PARTS) {
    if (normalised.includes(part.replace(/[^a-z0-9_]/g, ''))) {
      throw new SensitiveDataInAudit(path, why);
    }
  }
}

function checkValue(value: string, path: string): void {
  for (const [shape, why] of VALUE_SHAPES) {
    if (shape.test(value)) throw new SensitiveDataInAudit(path, why);
  }
}

function walk(value: unknown, path: string, depth: number): void {
  if (depth > 12) return;
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    checkValue(value, path);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
    return;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      checkKey(key, childPath);
      walk(child, childPath, depth + 1);
    }
  }
}

/** Throws {@link SensitiveDataInAudit} naming the offending path, or returns quietly. */
export function assertNoSensitiveData(metadata: Record<string, unknown>): void {
  walk(metadata, '', 0);
}
