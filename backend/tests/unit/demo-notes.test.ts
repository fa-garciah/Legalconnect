/**
 * 008 T023 — the demo firm's notes. `/notas` is judged against this data, so its shape is asserted:
 * written only by people on the matter who may write notes, Spanish, within the bounds 0049 checks,
 * never after the seed instant, a few still inside their author's 24-hour window, and keyed so a
 * re-seed on another day updates rather than accumulates.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_FIRMS, DEMO_PEOPLE } from '../../drizzle/demo/firm';
import { demoMatters } from '../../drizzle/demo/matters';
import { demoNotes } from '../../drizzle/demo/notes';

const AS_OF = new Date('2026-10-08T18:00:00Z');
const full = DEMO_FIRMS[0]!;
const matters = demoMatters(full, AS_OF);
const notes = demoNotes(full, matters, AS_OF);
const archetypeOf = new Map(DEMO_PEOPLE.map((p) => [p.slug, p.archetype]));

describe('volume, determinism and idempotency', () => {
  it('gives the open matters something to read', () => {
    expect(notes.length).toBeGreaterThan(20);
    expect(notes.length).toBeLessThan(200);
  });

  it('is deterministic', () => {
    expect(demoNotes(full, matters, AS_OF)).toEqual(notes);
  });

  it('keys every note on the matter’s date-free slot, never its file number or a date', () => {
    const keys = notes.map((n) => n.idKey.join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    for (const n of notes) {
      const matter = matters.find((m) => m.fileNumber === n.matterFileNumber)!;
      expect(n.idKey).toEqual([full.rfc, matter.slot, expect.stringMatching(/^n\d+$/)]);
      expect(n.idKey.join('|')).not.toMatch(/\d{4}-\d{2}/);
    }
  });

  it('a re-seed on another day lands on the same ids', () => {
    const later = new Date('2026-10-15T18:00:00Z');
    const again = demoNotes(full, demoMatters(full, later), later);
    const before = new Set(notes.map((n) => n.idKey.join('|')));
    const overlap = again.filter((n) => before.has(n.idKey.join('|'))).length;
    expect(overlap / again.length).toBeGreaterThan(0.8);
  });
});

describe('who and where (Decision 6)', () => {
  it('only MP, AA, PL and CM write notes — never BM or SA', () => {
    for (const n of notes) expect(['MP', 'AA', 'PL', 'CM']).toContain(archetypeOf.get(n.authorSlug));
  });

  it('every author is on the matter, and the matter is open', () => {
    const byNumber = new Map(matters.map((m) => [m.fileNumber, m]));
    for (const n of notes) {
      const matter = byNumber.get(n.matterFileNumber)!;
      expect(matter.closedOn).toBeNull();
      expect([matter.leadSlug, ...matter.collaboratorSlugs]).toContain(n.authorSlug);
      expect(n.createdAt.slice(0, 10) >= matter.openedOn).toBe(true);
    }
  });
});

describe('content and time', () => {
  it('is Spanish text within 0049’s bounds', () => {
    for (const n of notes) {
      expect(n.body.trim()).toBe(n.body);
      expect(n.body.length).toBeGreaterThan(0);
      expect(n.body.length).toBeLessThanOrEqual(5000);
      expect(n.body).toMatch(/[áéíóúñ]|\b(el|la|de|con|del)\b/i);
    }
  });

  it('never after the seed instant, and a few inside their author’s 24-hour window', () => {
    for (const n of notes) expect(Date.parse(n.createdAt)).toBeLessThanOrEqual(AS_OF.getTime());
    const fresh = notes.filter((n) => AS_OF.getTime() - Date.parse(n.createdAt) < 24 * 3_600_000);
    expect(fresh.length).toBeGreaterThanOrEqual(2);
  });

  it('the sparse firm gets a few as well', () => {
    const sparse = DEMO_FIRMS[1]!;
    expect(demoNotes(sparse, demoMatters(sparse, AS_OF), AS_OF).length).toBeGreaterThan(0);
  });
});
