/**
 * 009 T029 — the demo firm's recorded time. 009/FR-022, Decision 11, SC-008.
 *
 * `/horas` is judged against this data, so its shape is asserted rather than hoped for: real
 * timekeepers only, only on matters they are on, working days in the past, and loads that differ
 * enough between people for the screen to say something.
 *
 * Every rule that is also a CHECK in `0048_time_entry.sql` is asserted here too, because a fixture
 * that violates one fails at write time with a Postgres error that reads like a time-tracking bug.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_FIRMS, DEMO_PEOPLE } from '../../drizzle/demo/firm';
import { demoMatters } from '../../drizzle/demo/matters';
import { demoTimeEntries } from '../../drizzle/demo/time-entries';

const AS_OF = new Date('2026-10-08T18:00:00Z');
const full = DEMO_FIRMS[0]!;
const matters = demoMatters(full, AS_OF);
const entries = demoTimeEntries(full, matters, AS_OF);
const archetypeOf = new Map(DEMO_PEOPLE.map((p) => [p.slug, p.archetype]));
const byPerson = (slug: string) => entries.filter((e) => e.personSlug === slug);
const total = (slug: string) => byPerson(slug).reduce((s, e) => s + e.minutes, 0);

describe('volume, determinism and idempotency', () => {
  it('gives the firm six weeks of readable history', () => {
    expect(entries.length).toBeGreaterThan(150);
    expect(entries.length).toBeLessThan(800);
  });

  it('is deterministic', () => {
    expect(demoTimeEntries(full, matters, AS_OF)).toEqual(entries);
  });

  it('a re-seed on another day reuses the same ids, so it updates rather than accumulates', () => {
    const later = new Date('2026-10-15T18:00:00Z');
    const again = demoTimeEntries(full, demoMatters(full, later), later);
    const before = new Set(entries.map((e) => e.idKey.join('|')));
    const overlap = again.filter((e) => before.has(e.idKey.join('|'))).length;
    expect(overlap / again.length).toBeGreaterThan(0.6);
    expect(new Set(entries.map((e) => e.idKey.join('|'))).size).toBe(entries.length);
  });

  it('gives the sparse firm at least a few entries, so its timesheet is not empty', () => {
    const sparse = DEMO_FIRMS[1]!;
    expect(demoTimeEntries(sparse, demoMatters(sparse, AS_OF), AS_OF).length).toBeGreaterThan(0);
  });
});

describe('who and where (009 Decision 2)', () => {
  it('only MP, AA, PL and CM record time — never BM or SA', () => {
    for (const e of entries) expect(['MP', 'AA', 'PL', 'CM']).toContain(archetypeOf.get(e.personSlug));
    expect(new Set(entries.map((e) => e.personSlug)).size).toBe(5);
  });

  it('every entry is on a matter the person is assigned to, open on that day', () => {
    const byNumber = new Map(matters.map((m) => [m.fileNumber, m]));
    for (const e of entries) {
      const matter = byNumber.get(e.matterFileNumber)!;
      expect(matter, e.matterFileNumber).toBeDefined();
      expect([matter.leadSlug, ...matter.collaboratorSlugs], `${e.personSlug} on ${e.matterFileNumber}`).toContain(e.personSlug);
      expect(matter.openedOn <= e.workDate).toBe(true);
      if (matter.closedOn) expect(e.workDate <= matter.closedOn).toBe(true);
    }
  });
});

describe('when (FR-003, FR-011)', () => {
  it('working days only, in the six weeks before the seed day, never in the future', () => {
    const earliest = new Date(AS_OF.getTime() - 43 * 86_400_000).toISOString().slice(0, 10);
    const today = AS_OF.toISOString().slice(0, 10);
    for (const e of entries) {
      expect(e.workDate >= earliest && e.workDate < today, e.workDate).toBe(true);
      const weekday = new Date(`${e.workDate}T12:00:00Z`).getUTCDay();
      expect([1, 2, 3, 4, 5]).toContain(weekday);
    }
  });
});

describe('shape (0048 constraints)', () => {
  it('minutes are whole, 1 to 1440; descriptions 1 to 1000 characters', () => {
    for (const e of entries) {
      expect(Number.isInteger(e.minutes)).toBe(true);
      expect(e.minutes).toBeGreaterThanOrEqual(1);
      expect(e.minutes).toBeLessThanOrEqual(1440);
      expect(e.description.length).toBeGreaterThan(0);
      expect(e.description.length).toBeLessThanOrEqual(1000);
    }
  });

  it('a timer entry has a start and a stop exactly its minutes apart, on its own work day', () => {
    for (const e of entries.filter((x) => x.source === 'timer')) {
      expect(e.startedAt).not.toBeNull();
      expect(Date.parse(e.stoppedAt!) - Date.parse(e.startedAt!)).toBe(e.minutes * 60_000);
      // Business hours in Mexico City (UTC−6): the start's local date is the work day.
      expect(new Date(Date.parse(e.startedAt!) - 6 * 3_600_000).toISOString().slice(0, 10)).toBe(e.workDate);
    }
  });

  it('a manual entry has neither', () => {
    for (const e of entries.filter((x) => x.source === 'manual')) {
      expect(e.startedAt).toBeNull();
      expect(e.stoppedAt).toBeNull();
    }
  });
});

describe('uneven on purpose (Decision 11, SC-008)', () => {
  it('the heaviest timekeeper records at least twice the lightest', () => {
    const totals = ['mendez', 'ramirez', 'gonzalez', 'torres', 'villalobos'].map(total);
    expect(Math.max(...totals)).toBeGreaterThanOrEqual(2 * Math.min(...totals));
  });

  it('the senior associate out-records the junior one', () => {
    expect(total('ramirez')).toBeGreaterThan(total('gonzalez'));
  });

  it('the partner records mostly by hand; the associates mostly by timer', () => {
    const share = (slug: string) => byPerson(slug).filter((e) => e.source === 'manual').length / byPerson(slug).length;
    expect(share('mendez')).toBeGreaterThan(0.6);
    expect(share('ramirez')).toBeLessThan(0.5);
  });

  it('descriptions are Spanish prose a litigator would write', () => {
    for (const e of entries) expect(e.description).toMatch(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/);
  });
});
