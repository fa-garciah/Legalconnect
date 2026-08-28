/**
 * T019 — research.md D6: the collision predicate in isolation. Case- and
 * whitespace-insensitive against ACTIVE entries only; a retired name never collides.
 */
import { describe, expect, it } from 'vitest';
import { collidesWithActive } from '../../src/modules/directory/position-collision';

describe('position name collision (unit, no database)', () => {
  it('collides case-insensitively', () => {
    expect(collidesWithActive('asociado senior', ['Asociado Senior'])).toBe(true);
  });

  it('collides after trimming surrounding whitespace', () => {
    expect(collidesWithActive('  Socio  ', ['Socio'])).toBe(true);
  });

  it('does not collide with a distinct name', () => {
    expect(collidesWithActive('Pasante', ['Socio', 'Asociado'])).toBe(false);
  });

  it('does not collide against an empty active-name list (e.g. a retired-only catalog)', () => {
    expect(collidesWithActive('Socio', [])).toBe(false);
  });
});
