/**
 * 022/FR-014 across days. Every id the demo seed derives must be the same whatever day it runs on;
 * only the date-dependent COLUMNS may change. `demo-seed.test.ts` proves the consequence against a
 * database (a re-run 200 days later adds no row); this file pins the cause, without one.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_FIRMS } from '../../drizzle/demo/firm';
import { demoMatters } from '../../drizzle/demo/matters';
import { demoDocuments } from '../../drizzle/demo/documents';
import { demoCalendarEvents } from '../../drizzle/demo/calendar';

const DAYS = [new Date('2026-10-09T12:00:00Z'), new Date('2027-04-27T12:00:00Z'), new Date('2026-12-31T23:00:00Z')];

describe.each(DAYS.slice(1))('seeding on %s instead of 2026-10-09', (other) => {
  for (const firm of DEMO_FIRMS) {
    const at = (day: Date) => {
      const matters = demoMatters(firm, day);
      return { matters, documents: demoDocuments(firm, matters, day), events: demoCalendarEvents(firm, matters, day) };
    };
    const a = at(DAYS[0]!);
    const b = at(other);

    it(`${firm.slug}: the same matter slots, in the same order`, () => {
      expect(b.matters.map((m) => m.slot)).toEqual(a.matters.map((m) => m.slot));
      expect(new Set(a.matters.map((m) => m.slot)).size).toBe(a.matters.length);
    });

    it(`${firm.slug}: the same document keys — none mentions a file number`, () => {
      const keys = (d: typeof a.documents) => d.map((x) => x.storageKeyParts.join('|'));
      expect(keys(b.documents)).toEqual(keys(a.documents));
      for (const key of keys(a.documents)) expect(key).not.toMatch(/EXP-/);
    });

    it(`${firm.slug}: the same event keys`, () => {
      expect(b.events.map((e) => e.key)).toEqual(a.events.map((e) => e.key));
      expect(new Set(a.events.map((e) => e.key)).size).toBe(a.events.length);
    });
  }
});
