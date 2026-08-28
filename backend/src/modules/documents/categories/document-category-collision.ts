/**
 * T033 — research.md D1. The collision predicate, pure and DB-free. The functional
 * unique index (`document_category_tenant_active_name_unique`, 0026) is the
 * backstop; this is the friendly 409 ahead of it (006/017's own precedent).
 */
const normalise = (name: string): string => name.trim().toLowerCase();

export function collidesWithActive(name: string, activeNames: readonly string[]): boolean {
  const target = normalise(name);
  return activeNames.some((existing) => normalise(existing) === target);
}
