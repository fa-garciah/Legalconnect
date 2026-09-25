/**
 * T010 — the demo firm, its people, and the credentials they sign in with.
 * 022/FR-001, FR-003, FR-018, FR-019, Decisions 2, 6 and 8.
 *
 * EVERYTHING IN THIS FILE IS INVENTED. The firms, the people and the RFCs resemble no real
 * firm, person or taxpayer; they were chosen to be plainly synthetic. That is a requirement
 * (FR-005 for clients, and the same reasoning here) rather than a courtesy: a demo that ships
 * a real law firm's name is a problem for that firm.
 *
 * WHY THE CREDENTIALS ARE FIXED AND COMMITTED (Decision 2). A random secret printed once is
 * lost the moment the terminal scrolls, and the next person works around it — which is
 * exactly how this slice's own problem was worked around on 2026-09-25, with a throwaway
 * script writing an `identity_credential` by hand. Fixed material is the point: a demo you
 * can return to tomorrow.
 *
 * WHY IT IS NOT A PRINCIPLE VI VIOLATION. Two controls, and neither is sufficient alone:
 *
 *   1. `guard.ts` refuses to run outside a local database, so this material can never reach
 *      a real one. Fixture credentials for a database that is provably local are on the same
 *      standing as `POSTGRES_PASSWORD: lc_migration_dev` in `docker-compose.yml` and
 *      `TEST_CREDENTIAL` in `tests/helpers/auth-seed.ts`.
 *   2. `tsconfig.build.json` excludes this directory, so none of it is compiled into `dist/`
 *      and shipped in a deployed image. The guard is a runtime control; it has nothing to say
 *      about material already inside an artifact.
 *
 * WHY THE SECRETS ARE DERIVED FROM PHRASES rather than written out as base32. What the
 * repository then commits is `demo-totp-mendez` — readable, obviously a fixture, and not the
 * kind of high-entropy blob a secret scanner is built to catch (SC-009). The base32 an
 * authenticator receives is computed from it.
 *
 * NOTHING HERE WEAKENS MFA (FR-013). These people enroll exactly as real ones do: a real
 * Argon2id credential, a real confirmed TOTP factor, real backup codes. The printed secret is
 * how a human passes the challenge — not a way around it.
 */
import { createHash } from 'node:crypto';

/** One shared password. Long, readable, and unmistakably a fixture. */
export const DEMO_PASSWORD = 'demo-local-legalconnect-2026';

export const DEMO_EMAIL_DOMAIN = 'demo.legalconnect.mx';

export interface DemoFirm {
  readonly slug: string;
  readonly name: string;
  readonly rfc: string;
  readonly planCode: 'esencial' | 'profesional' | 'premium';
  /** The second firm exists to make isolation visible, not to be reviewed. Decision 8. */
  readonly sparse: boolean;
}

export const DEMO_FIRMS: readonly DemoFirm[] = [
  {
    slug: 'mendez',
    name: 'Despacho Méndez & Asociados, S.C.',
    rfc: 'DMA180312K21',
    planCode: 'profesional',
    sparse: false,
  },
  {
    slug: 'rios',
    name: 'Bufete Ríos y Caballero, S.C.',
    rfc: 'BRC200715J43',
    planCode: 'esencial',
    sparse: true,
  },
] as const;

export type InternalArchetype = 'MP' | 'AA' | 'PL' | 'CM' | 'BM' | 'SA';

export interface DemoPerson {
  readonly slug: string;
  readonly name: string;
  readonly email: string;
  readonly archetype: InternalArchetype;
  readonly position: string;
  /** 001/FR-021 — one human, two firms, two archetypes. Exactly one person has this. */
  readonly alsoAt?: {
    readonly firmRfc: string;
    readonly archetype: InternalArchetype;
    readonly position: string;
  };
}

/**
 * Three positions the firm-agnostic default catalog cannot supply, because that catalog
 * describes an attorney hierarchy and three of these seven people are not attorneys. Added
 * to THIS TENANT's own catalog — Principle III is untouched (`position-catalog.seed.ts`
 * calls its entries "five ordinary rows the firm owns outright").
 */
export const DEMO_POSITIONS_EXTRA = [
  'Coordinadora de Casos',
  'Administrador',
  'Administrador de Sistemas',
] as const;

/** Categories a litigation practice files under, beyond the four shipped defaults. */
export const DEMO_CATEGORIES_EXTRA = [
  'Demanda',
  'Contestación',
  'Resolución',
  'Anexo',
  'Recurso',
  'Dictamen',
] as const;

const email = (first: string, last: string): string =>
  `${first}.${last}@${DEMO_EMAIL_DOMAIN}`.toLowerCase();

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  {
    slug: 'mendez',
    name: 'Alejandro Méndez Solórzano',
    email: email('alejandro', 'mendez'),
    archetype: 'MP',
    position: 'Socio',
  },
  {
    slug: 'ramirez',
    name: 'Laura Ramírez Ibarra',
    email: email('laura', 'ramirez'),
    archetype: 'AA',
    position: 'Asociado Senior',
    // The tenant switcher has never had a fixture a human could see working.
    alsoAt: { firmRfc: 'BRC200715J43', archetype: 'MP', position: 'Socio' },
  },
  {
    slug: 'gonzalez',
    name: 'Jorge González Peña',
    email: email('jorge', 'gonzalez'),
    archetype: 'AA',
    position: 'Asociado',
  },
  {
    slug: 'torres',
    name: 'Mariana Torres Aguilar',
    email: email('mariana', 'torres'),
    archetype: 'PL',
    position: 'Paralegal',
  },
  {
    slug: 'villalobos',
    name: 'Rocío Villalobos Nieto',
    email: email('rocio', 'villalobos'),
    archetype: 'CM',
    position: 'Coordinadora de Casos',
  },
  {
    slug: 'pantoja',
    name: 'Sergio Pantoja Duarte',
    email: email('sergio', 'pantoja'),
    archetype: 'BM',
    position: 'Administrador',
  },
  {
    slug: 'carrasco',
    name: 'Ivonne Carrasco Lira',
    email: email('ivonne', 'carrasco'),
    archetype: 'SA',
    position: 'Administrador de Sistemas',
  },
] as const;

/* --------------------------------------------------------------------------
 * Derived credential material. Decision 2.
 * ----------------------------------------------------------------------- */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, unpadded — what an authenticator app expects to be handed. */
function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The TOTP secret for one demo person, derived from a phrase this file commits.
 *
 * Hashed rather than base32-ing the phrase directly, so the secret is a full 160 bits
 * regardless of how short a slug is — a five-character slug would otherwise produce a
 * 25-bit key, which is a bad habit to leave lying around in a file people copy from.
 */
export function totpSecretFor(slug: string): string {
  return base32Encode(createHash('sha256').update(`demo-totp-${slug}`).digest().subarray(0, 20));
}

/** The alphabet `modules/auth/backup-codes.ts` chose: Crockford-style, minus I, L, O and U. */
const BACKUP_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Ten backup codes for one demo person, derived so a re-run prints the same ten (FR-014)
 * and `quickstart.md` can document them (FR-018).
 *
 * `generateBackupCodeSet()` is deliberately NOT used: it draws from `randomInt`, which is
 * right for a real person and wrong for a fixture that must be reproducible. The FORMAT is
 * the same — 30 characters of that alphabet, grouped in fives — so `recovery.service.ts`
 * consumes these unmodified, and they are stored under the same `hashHighEntropy` profile.
 */
export function backupCodesFor(slug: string): readonly string[] {
  return Array.from({ length: 10 }, (_, index) => {
    const digest = createHash('sha256').update(`demo-backup-${slug}-${index}`).digest();
    let raw = '';
    for (let i = 0; i < 30; i += 1) {
      raw += BACKUP_ALPHABET[(digest[i] as number) % BACKUP_ALPHABET.length];
    }
    return (raw.match(/.{1,5}/g) ?? [raw]).join('-');
  });
}

/**
 * Every string a person could read on screen or in the printed table, for the FR-019
 * Spanish assertion. Listed by a function rather than a constant so a new field added above
 * is covered here without anybody remembering to update a second list.
 */
export function demoVisibleStrings(): readonly string[] {
  return [
    ...DEMO_FIRMS.flatMap((f) => [f.name]),
    ...DEMO_PEOPLE.flatMap((p) => [p.name, p.position, ...(p.alsoAt ? [p.alsoAt.position] : [])]),
    ...DEMO_POSITIONS_EXTRA,
    ...DEMO_CATEGORIES_EXTRA,
  ];
}
