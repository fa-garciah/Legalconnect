/**
 * T019 — research.md D6's collision predicate, in isolation.
 *
 * The functional unique index in `backend/drizzle/0020` is the backstop; this
 * predicate is the primary UX, the same division 001's RFC uniqueness already uses
 * (a friendly `409` beats a raw constraint-violation `500`). Because it is the
 * friendlier half, it has to agree with the index EXACTLY — same normalisation
 * (`lower(trim(...))`), same restriction (`WHERE status = 'active'`) — or the two
 * disagree and a request slips past the check into the constraint.
 *
 * Pure: no database, no container. The predicate is a string comparison.
 */
import { describe, expect, it } from 'vitest';
import { collidesWith, normaliseName } from '../../src/modules/directory/position.service';
import type { CatalogPosition } from '../../src/modules/directory/directory-entry.repository';

const active = (name: string): CatalogPosition => ({ id: name, name, status: 'active' });
const retired = (name: string): CatalogPosition => ({ id: name, name, status: 'retired' });

describe('normaliseName — the same normalisation the unique index applies', () => {
  it('trims and lowercases, matching lower(trim(name))', () => {
    expect(normaliseName('  Asociado  ')).toBe('asociado');
    expect(normaliseName('ASOCIADO')).toBe('asociado');
    expect(normaliseName('Asociado')).toBe('asociado');
  });

  it('leaves interior whitespace alone — "Asociado Senior" is not "AsociadoSenior"', () => {
    expect(normaliseName('Asociado Senior')).toBe('asociado senior');
    expect(normaliseName('Asociado Senior')).not.toBe(normaliseName('AsociadoSenior'));
  });
});

describe('collidesWith — active entries only, case- and whitespace-insensitive', () => {
  const catalog = [active('Socio'), active('Asociado Senior'), retired('Of Counsel')];

  it('matches an exact name already active', () => {
    expect(collidesWith(catalog, 'Socio')).toBe(true);
  });

  it('matches differing only by case', () => {
    expect(collidesWith(catalog, 'socio')).toBe(true);
    expect(collidesWith(catalog, 'SOCIO')).toBe(true);
  });

  it('matches differing only by surrounding whitespace', () => {
    expect(collidesWith(catalog, '  Socio ')).toBe(true);
    expect(collidesWith(catalog, 'asociado senior  ')).toBe(true);
  });

  it('does not match a genuinely different name', () => {
    expect(collidesWith(catalog, 'Pasante')).toBe(false);
    expect(collidesWith(catalog, 'Socio Fundador')).toBe(false);
  });

  it('NEVER matches a retired entry — that is what makes retire-then-recreate legal (D4/D6)', () => {
    expect(collidesWith(catalog, 'Of Counsel')).toBe(false);
    expect(collidesWith(catalog, 'of counsel')).toBe(false);
    expect(collidesWith(catalog, '  OF COUNSEL  ')).toBe(false);
  });

  it('an empty catalog collides with nothing', () => {
    expect(collidesWith([], 'Socio')).toBe(false);
  });
});
