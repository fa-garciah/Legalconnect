/**
 * T005 — a search term is literal text, not a pattern. 023/FR-008.
 *
 * `ILIKE` treats `%` and `_` as wildcards, so interpolating a person's search term directly
 * makes "100%" match every row and "a_b" match "axb". The product does that today in two
 * places (`case.repository.ts:171-179`, `client.repository.ts:84`); this slice does not add a
 * third. The existing defect is recorded in `023/spec.md`'s Edge Cases rather than fixed here,
 * because changing two other slices' search behaviour inside this diff would be harder to
 * review than naming it.
 *
 * Apply EXACTLY ONCE, at the boundary where the term enters a pattern. Escaping twice turns a
 * search for `100%` into a search for the literal text `100\%`, which is why the unit test
 * asserts the non-idempotence rather than leaving it to be discovered.
 */

/**
 * Named explicitly so the SQL can say `ESCAPE '\'` rather than lean on the server default.
 * Postgres' default happens to be backslash, but a query that states it cannot be broken by a
 * configuration change somewhere else.
 */
export const LIKE_ESCAPE_CHAR = '\\';

export function escapeLike(term: string): string {
  // The escape character FIRST. Doing the wildcards first would turn `\%` into `\\%`, putting
  // the percent back to work as a wildcard — the one ordering mistake this function can make.
  return term.split('\\').join('\\\\').split('%').join('\\%').split('_').join('\\_');
}
