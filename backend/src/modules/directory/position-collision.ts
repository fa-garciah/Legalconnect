/**
 * research.md D6 — the collision predicate, pure and DB-free so T019 can exercise it
 * in isolation. The functional unique index (`position_tenant_active_name_unique`,
 * 0020) is the backstop; this is the friendly 409 ahead of it (the same pattern
 * 001's RFC uniqueness uses).
 */
const normalise = (name: string): string => name.trim().toLowerCase();

export function collidesWithActive(name: string, activeNames: readonly string[]): boolean {
  const target = normalise(name);
  return activeNames.some((existing) => normalise(existing) === target);
}
