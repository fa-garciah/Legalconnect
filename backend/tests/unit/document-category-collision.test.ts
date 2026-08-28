/**
 * T032 — the collision predicate in isolation, mirroring 017's `collidesWithActive`
 * shape as its own local function (this module does not import 017's — 006's
 * catalog-api.md precedent: structurally identical logic, deliberately not shared
 * across domain modules).
 */
import { describe, expect, it } from 'vitest';
import { collidesWithActive } from '../../src/modules/documents/categories/document-category-collision';

describe('document category name collision (unit, no database)', () => {
  it('collides case-insensitively', () => {
    expect(collidesWithActive('contrato', ['Contrato'])).toBe(true);
  });

  it('collides after trimming surrounding whitespace', () => {
    expect(collidesWithActive('  Evidencia  ', ['Evidencia'])).toBe(true);
  });

  it('does not collide with a distinct name', () => {
    expect(collidesWithActive('Correspondencia', ['Contrato', 'Evidencia'])).toBe(false);
  });

  it('does not collide against an empty active-name list', () => {
    expect(collidesWithActive('Contrato', [])).toBe(false);
  });
});
