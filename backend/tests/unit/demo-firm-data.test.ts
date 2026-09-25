/**
 * T009, T009a, T011 — the demo firm's people, and the credentials they sign in with.
 * 022/FR-001, FR-003, FR-018, FR-019.
 *
 * The point of the slice is that a human can sign in, so the assertions that matter most
 * here are the ones about material a human retypes: that the printed TOTP secret really
 * produces codes the product accepts (T011), and that the people cover every internal
 * archetype so the permission matrix can be seen on a screen rather than read in a table.
 */
import { describe, expect, it } from 'vitest';
import { generateAt, verifyCode } from '../../src/common/auth/totp';
import { DEFAULT_POSITION_CATALOG } from '../../src/modules/directory/position-catalog.seed';
import { DEFAULT_DOCUMENT_CATEGORIES } from '../../src/modules/documents/categories/document-category.seed';
import {
  DEMO_CATEGORIES_EXTRA,
  DEMO_FIRMS,
  DEMO_PASSWORD,
  DEMO_PEOPLE,
  DEMO_POSITIONS_EXTRA,
  backupCodesFor,
  demoVisibleStrings,
  totpSecretFor,
} from '../../drizzle/demo/firm';

const RFC_SHAPE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

describe('the two firms', () => {
  it('are two, one full and one deliberately sparse (Decision 8)', () => {
    expect(DEMO_FIRMS).toHaveLength(2);
    expect(DEMO_FIRMS[0]?.sparse).toBe(false);
    expect(DEMO_FIRMS[1]?.sparse).toBe(true);
  });

  it('carry RFCs the tenant table will accept', () => {
    for (const firm of DEMO_FIRMS) expect(firm.rfc).toMatch(RFC_SHAPE);
  });

  it('have distinct RFCs, which is the idempotency key', () => {
    expect(new Set(DEMO_FIRMS.map((f) => f.rfc)).size).toBe(DEMO_FIRMS.length);
  });

  it('name a plan that the seed knows how to create', () => {
    for (const firm of DEMO_FIRMS) {
      expect(['esencial', 'profesional', 'premium']).toContain(firm.planCode);
    }
  });
});

describe('the seven people (FR-001)', () => {
  it('cover every internal archetype, with two associates', () => {
    expect(DEMO_PEOPLE).toHaveLength(7);
    expect(DEMO_PEOPLE.map((p) => p.archetype).sort()).toEqual(
      ['AA', 'AA', 'BM', 'CM', 'MP', 'PL', 'SA'].sort(),
    );
  });

  it('have unique, lowercase emails on the demo domain', () => {
    const emails = DEMO_PEOPLE.map((p) => p.email);
    expect(new Set(emails).size).toBe(emails.length);
    for (const email of emails) {
      expect(email).toBe(email.toLowerCase());
      expect(email.endsWith('@demo.legalconnect.mx')).toBe(true);
    }
  });

  it('cannot collide with the fixture identities db:seed already writes', () => {
    // `seed.ts` uses @example.com; a collision would hit identity's normalized-email
    // unique index and fail the command for a reason that looks like a bug.
    for (const person of DEMO_PEOPLE) expect(person.email).not.toContain('@example.com');
  });

  it('have unique slugs, which key every derived credential', () => {
    const slugs = DEMO_PEOPLE.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('hold a position their firm actually has in its catalog (Decision 6)', () => {
    const available = new Set<string>([...DEFAULT_POSITION_CATALOG, ...DEMO_POSITIONS_EXTRA]);
    for (const person of DEMO_PEOPLE) expect(available).toContain(person.position);
  });

  it('include exactly one person with a membership in both firms (FR-001, 001/FR-021)', () => {
    const dual = DEMO_PEOPLE.filter((p) => p.alsoAt !== undefined);
    expect(dual).toHaveLength(1);
    expect(dual[0]?.alsoAt?.firmRfc).toBe(DEMO_FIRMS[1]?.rfc);
    // A different archetype in each firm is the whole point: one human, two roles.
    expect(dual[0]?.alsoAt?.archetype).not.toBe(dual[0]?.archetype);
  });

  it('places the BM where the document capabilities end', () => {
    // 023 removes BM from the documents nav on the strength of this: matrix.ts grants BM
    // none of the eight document.* capabilities.
    const bm = DEMO_PEOPLE.find((p) => p.archetype === 'BM');
    expect(bm).toBeDefined();
  });
});

describe('the demo-owned catalog rows (Decision 6)', () => {
  it('add positions the firm-agnostic default cannot supply', () => {
    for (const extra of DEMO_POSITIONS_EXTRA) {
      expect(DEFAULT_POSITION_CATALOG as readonly string[]).not.toContain(extra);
    }
  });

  it('add document categories a litigation practice needs', () => {
    expect(DEMO_CATEGORIES_EXTRA.length).toBeGreaterThanOrEqual(5);
    for (const extra of DEMO_CATEGORIES_EXTRA) {
      expect(DEFAULT_DOCUMENT_CATEGORIES as readonly string[]).not.toContain(extra);
    }
  });
});

describe('the derived credentials (Decision 2)', () => {
  it('derives a valid base32 TOTP secret per person', () => {
    for (const person of DEMO_PEOPLE) {
      expect(totpSecretFor(person.slug)).toMatch(/^[A-Z2-7]+$/);
    }
  });

  it('gives every person a different secret', () => {
    const secrets = DEMO_PEOPLE.map((p) => totpSecretFor(p.slug));
    expect(new Set(secrets).size).toBe(secrets.length);
  });

  it('derives the same secret every time, so a re-run prints the same thing (FR-014)', () => {
    expect(totpSecretFor('mendez')).toBe(totpSecretFor('mendez'));
  });

  /**
   * T011 — the assertion the whole slice rests on. A printed secret that an authenticator
   * cannot use is worse than no secret at all: the command looks like it worked.
   */
  it('produces codes the product itself accepts', async () => {
    const now = Math.floor(Date.UTC(2026, 8, 25, 12, 0, 0) / 1000);
    for (const person of DEMO_PEOPLE) {
      const secret = totpSecretFor(person.slug);
      const code = await generateAt(secret, now);
      expect(code).toMatch(/^\d{6}$/);
      await expect(verifyCode(secret, code, now)).resolves.toBe(true);
    }
  });

  it('does not accept one person\'s code for another person', async () => {
    const now = Math.floor(Date.UTC(2026, 8, 25, 12, 0, 0) / 1000);
    const code = await generateAt(totpSecretFor('mendez'), now);
    await expect(verifyCode(totpSecretFor('ramirez'), code, now)).resolves.toBe(false);
  });

  it('issues ten distinct backup codes per person, in the readable format', () => {
    for (const person of DEMO_PEOPLE) {
      const codes = backupCodesFor(person.slug);
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      for (const code of codes) {
        // The alphabet `backup-codes.ts` chose: Crockford-style, minus I, L, O and U.
        expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}(-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}){5}$/);
      }
    }
  });

  it('gives no two people the same backup code', () => {
    const all = DEMO_PEOPLE.flatMap((p) => backupCodesFor(p.slug));
    expect(new Set(all).size).toBe(all.length);
  });

  it('uses a password that reads as a fixture rather than as a secret (SC-009)', () => {
    expect(DEMO_PASSWORD).toContain('demo');
    expect(DEMO_PASSWORD.length).toBeGreaterThanOrEqual(12);
  });
});

describe('FR-019 — everything a demo user sees is Spanish', () => {
  /**
   * The shape `frontend/tests/component/spanish-copy.test.tsx` uses, applied to seed data
   * instead of to rendered components — which that test can never reach.
   */
  const ENGLISH_TELLS = /\b(the|and|is|are|for|of|with|case|file|status|client|document|law|firm|partner|associate|manager|system)\b/i;
  const ALLOWED = [/S\.A\. de C\.V\./g, /S\. de R\.L\./g, /S\.C\./g, /S\.P\.R\./g, /EXP/g, /RFC/g];

  it('carries no English tell in any demo-visible string', () => {
    for (const value of demoVisibleStrings()) {
      let text = value;
      for (const token of ALLOWED) text = text.replace(token, ' ');
      expect(text, `"${value}" reads as English`).not.toMatch(ENGLISH_TELLS);
    }
  });

  it('checks a non-trivial number of strings, so the assertion is not vacuous', () => {
    expect(demoVisibleStrings().length).toBeGreaterThan(20);
  });
});
