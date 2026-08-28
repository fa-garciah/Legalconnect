/**
 * T024 — 006/FR-019. The collision predicate, pinned character for character against what
 * the partial unique indexes in `backend/drizzle/0024` produce.
 *
 * Mirrors 017's `position-name-collision.test.ts`, and exists for the same reason: the
 * service's pre-check and the database's index must agree EXACTLY on normalisation and on
 * the `status = 'active'` restriction. If they drift, one of two things happens — a
 * friendly 409 becomes a raw constraint-violation 500, or a name the index would have
 * refused slips past the service and fails later, in a transaction that has already done
 * other work.
 *
 * One parameterised suite across all three catalogs rather than three copies: they share a
 * repository, a service and an index shape, so three copies would be three places for the
 * same rule to drift.
 */
import { describe, expect, it } from 'vitest';
import {
  assertCatalogName,
  assertIsClosing,
  collidesWith,
  normaliseName,
} from '../../src/modules/case-core/catalogs/case-catalog.service';
import type { CatalogEntryRow } from '../../src/modules/case-core/catalogs/case-catalog.repository';

const entry = (name: string, status: 'active' | 'retired' = 'active'): CatalogEntryRow => ({
  id: `id-${name}-${status}`,
  name,
  status,
  createdAt: '2026-08-27T00:00:00.000Z',
  retiredAt: status === 'retired' ? '2026-08-27T00:00:00.000Z' : null,
});

describe('the catalog collision predicate', () => {
  describe('normalisation matches lower(trim(name))', () => {
    it('trims the ends and lowers the case', () => {
      expect(normaliseName('  En Proceso  ')).toBe('en proceso');
      expect(normaliseName('EN PROCESO')).toBe('en proceso');
    });

    it('leaves INTERIOR whitespace alone', () => {
      // `lower(trim(name))` does not collapse interior spaces, and neither may this.
      // "Juzgado Primero" and "JuzgadoPrimero" are different courts, and collapsing them
      // would refuse a name a firm legitimately wants. 017 made the same call for
      // "Asociado Senior".
      expect(normaliseName('Juzgado  Primero')).toBe('juzgado  primero');
      expect(normaliseName('Juzgado Primero')).not.toBe(normaliseName('JuzgadoPrimero'));
    });
  });

  describe('collision is ACTIVE-only', () => {
    it('collides on an active entry, whatever its case or padding', () => {
      const catalog = [entry('En Proceso')];
      for (const candidate of ['En Proceso', 'en proceso', 'EN PROCESO', '  En Proceso  ']) {
        expect(collidesWith(catalog, candidate)).toBe(true);
      }
    });

    it('does NOT collide on a retired entry — this is what makes retire-then-recreate legal', () => {
      expect(collidesWith([entry('Archivado', 'retired')], 'Archivado')).toBe(false);
    });

    it('collides when an active and a retired entry share the name', () => {
      // Both exist, and the index refuses only against the active one.
      const catalog = [entry('Concluido', 'retired'), entry('Concluido')];
      expect(collidesWith(catalog, 'concluido')).toBe(true);
    });

    it('does not collide on a different name', () => {
      expect(collidesWith([entry('Civil')], 'Mercantil')).toBe(false);
    });

    it('does not collide against an empty catalog', () => {
      expect(collidesWith([], 'Cualquiera')).toBe(false);
    });
  });

  describe('name validation stores the firm\'s own words', () => {
    it('trims but preserves case', () => {
      expect(assertCatalogName('  Amparo Directo  ')).toBe('Amparo Directo');
    });

    it('refuses an empty or whitespace-only name', () => {
      for (const bad of ['', '   ', '\t\n']) {
        expect(() => assertCatalogName(bad)).toThrow();
      }
    });

    it('refuses a non-string and an over-long name', () => {
      expect(() => assertCatalogName(42)).toThrow();
      expect(() => assertCatalogName(null)).toThrow();
      expect(() => assertCatalogName('x'.repeat(121))).toThrow();
    });
  });

  describe('isClosing (FR-008a) belongs to case statuses alone', () => {
    it('defaults to false when absent', () => {
      expect(assertIsClosing(undefined, 'case-statuses')).toBe(false);
      expect(assertIsClosing(null, 'case-statuses')).toBe(false);
    });

    it('is accepted on case statuses', () => {
      expect(assertIsClosing(true, 'case-statuses')).toBe(true);
      expect(assertIsClosing(false, 'case-statuses')).toBe(false);
    });

    it('is REFUSED on the other two rather than silently dropped', () => {
      // Dropping it would let a firm believe they had marked something they had not, and
      // the mistake would surface much later as matters that never close.
      for (const segment of ['matter-types', 'venues'] as const) {
        expect(() => assertIsClosing(true, segment)).toThrow();
        expect(() => assertIsClosing(false, segment)).toThrow();
      }
    });

    it('absent is still fine on the other two — only an explicit value is refused', () => {
      for (const segment of ['matter-types', 'venues'] as const) {
        expect(assertIsClosing(undefined, segment)).toBe(false);
      }
    });

    it('refuses a non-boolean', () => {
      expect(() => assertIsClosing('yes', 'case-statuses')).toThrow();
      expect(() => assertIsClosing(1, 'case-statuses')).toThrow();
    });
  });
});
