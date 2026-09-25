/**
 * T004 — search terms are literal text, not patterns. 023/FR-008, SC-005.
 *
 * THE DEFECT THIS AVOIDS, which the product already has twice. `case.repository.ts:171-179`
 * and `client.repository.ts:84` interpolate a user's search term straight into
 * `ILIKE '%' || $1 || '%'`. A term containing `%` is then a wildcard: searching for "100%"
 * matches every row, and searching "a_b" matches "axb". Nobody has noticed because nobody
 * searches for punctuation — right up until a file is called "Convenio 50% anticipo.pdf".
 *
 * This slice does not inherit that. It is recorded in `023/spec.md`'s Edge Cases rather than
 * fixed for `006`/`018` here, because a slice that quietly changes two other slices' search
 * behaviour is harder to review than one that says what it found.
 */
import { describe, expect, it } from 'vitest';
import { LIKE_ESCAPE_CHAR, escapeLike } from '../../src/modules/documents/like-escape';

describe('escapeLike', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeLike('dictamen')).toBe('dictamen');
    expect(escapeLike('EXP-2026-2001')).toBe('EXP-2026-2001');
    expect(escapeLike('Contestación de demanda')).toBe('Contestación de demanda');
  });

  it('escapes the percent wildcard', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('50% anticipo')).toBe('50\\% anticipo');
  });

  it('escapes the single-character wildcard', () => {
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('__')).toBe('\\_\\_');
  });

  it('escapes the escape character itself, first', () => {
    // If the backslash were escaped after the wildcards, `\%` would become `\\%` and the
    // percent would go back to being a wildcard. Order is the whole correctness question.
    expect(escapeLike('\\')).toBe('\\\\');
    expect(escapeLike('\\%')).toBe('\\\\\\%');
  });

  it('declares the escape character the SQL must name', () => {
    // Postgres' default LIKE escape IS backslash, but `standard_conforming_strings` and
    // future defaults make relying on it fragile: the query says ESCAPE explicitly, and this
    // constant is what it says.
    expect(LIKE_ESCAPE_CHAR).toBe('\\');
  });

  it('is deliberately not idempotent, and callers must apply it exactly once', () => {
    // Documented by assertion rather than by comment: escaping twice doubles the escapes and
    // turns a search for "100%" into a search for the literal text `100\%`.
    expect(escapeLike(escapeLike('100%'))).toBe('100\\\\\\%');
  });

  it('handles an empty string without producing one of anything', () => {
    expect(escapeLike('')).toBe('');
  });
});
