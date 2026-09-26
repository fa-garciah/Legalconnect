/**
 * T017 — the firm's matters. 022/FR-006, FR-007.
 *
 * This is the file `015-kpi-dashboard` is really about. Every KPI it computes reduces to a
 * property of this generator:
 *
 *   - "active matters" needs matters whose status is not a closing one;
 *   - "average resolution time" needs `closed_on` set, and set LATER than `opened_on`;
 *   - "matters per attorney" needs `lead` assignments that are not evenly spread, or the
 *     chart is a straight line and proves nothing;
 *   - "quarterly trend" needs `opened_on` spread across quarters rather than clustered on
 *     the seed date.
 *
 * An empty chart and a broken chart look identical on screen, which is why these are
 * asserted here, in `test:unit`, rather than discovered by looking at a dashboard.
 *
 * The clock is INJECTED. A generator that read `Date.now()` would produce different data on
 * two machines run on different days, breaking FR-017 — and `demo-rng.test.ts` scans this
 * directory for exactly that.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CASE_STATUSES, DEFAULT_MATTER_TYPES } from '../../src/modules/case-core/catalogs/case-catalog.seed';
import { DEMO_FIRMS, DEMO_PEOPLE } from '../../drizzle/demo/firm';
import { demoMatters, quarterStarts } from '../../drizzle/demo/matters';

const AS_OF = new Date('2026-09-25T00:00:00Z');
const full = DEMO_FIRMS[0]!;
const sparse = DEMO_FIRMS[1]!;
const matters = demoMatters(full, AS_OF);
const CLOSING = DEFAULT_CASE_STATUSES.filter((s) => s.isClosing).map((s) => s.name);

describe('volume and determinism', () => {
  it('gives the full firm about 40 matters', () => {
    expect(matters.length).toBe(40);
  });

  it('gives the sparse firm a handful', () => {
    expect(demoMatters(sparse, AS_OF).length).toBe(5);
  });

  it('is deterministic for a fixed clock', () => {
    expect(demoMatters(full, AS_OF)).toEqual(demoMatters(full, AS_OF));
  });
});

describe('file numbers', () => {
  it('are unique within the firm', () => {
    const numbers = matters.map((m) => m.fileNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('take the EXP-<year>-<nnnn> shape', () => {
    for (const matter of matters) expect(matter.fileNumber).toMatch(/^EXP-20\d{2}-\d{4}$/);
  });

  it('carry the year the matter was opened, as a firm\'s own numbering would', () => {
    for (const matter of matters) {
      expect(matter.fileNumber.slice(4, 8)).toBe(matter.openedOn.slice(0, 4));
    }
  });

  it('do not collide with the fixture matters db:seed writes', () => {
    // `seed.ts` writes EXP-2026-0001…0003 and EXP-2026-0011…0013 in its own tenants. The
    // demo firm is a different tenant, so a collision is impossible — but a reader comparing
    // two databases should not have to work that out, so the ranges are kept apart.
    for (const matter of matters) expect(matter.fileNumber).not.toMatch(/^EXP-2026-00[01]\d$/);
  });
});

describe('the six quarters (FR-006)', () => {
  it('opens matters across six distinct quarters ending in the current one', () => {
    const quarters = new Set(matters.map((m) => m.openedOn.slice(0, 7)));
    expect(quarters.size).toBeGreaterThanOrEqual(6);
    const starts = quarterStarts(AS_OF, 6);
    expect(starts).toHaveLength(6);
    const earliest = starts[0]!;
    for (const matter of matters) {
      expect(matter.openedOn >= earliest).toBe(true);
      expect(matter.openedOn <= '2026-09-25').toBe(true);
    }
  });

  it('puts matters in every one of those six quarters, so a trend line has six points', () => {
    for (const start of quarterStarts(AS_OF, 6)) {
      const quarter = start.slice(0, 4) + '-' + start.slice(5, 7);
      const inQuarter = matters.filter((m) => {
        const [y, mo] = [m.openedOn.slice(0, 4), Number(m.openedOn.slice(5, 7))];
        const qStart = Number(quarter.slice(5, 7));
        return y === quarter.slice(0, 4) && mo >= qStart && mo <= qStart + 2;
      });
      expect(inQuarter.length, `no matter opened in the quarter starting ${start}`).toBeGreaterThan(0);
    }
  });
});

describe('statuses and closing dates (FR-006)', () => {
  it('uses every default status', () => {
    const used = new Set(matters.map((m) => m.statusName));
    for (const status of DEFAULT_CASE_STATUSES) expect(used).toContain(status.name);
  });

  it('sets closed_on exactly on the matters whose status closes them', () => {
    for (const matter of matters) {
      if (CLOSING.includes(matter.statusName)) {
        expect(matter.closedOn, matter.fileNumber).not.toBeNull();
      } else {
        expect(matter.closedOn, matter.fileNumber).toBeNull();
      }
    }
  });

  it('closes them strictly after they were opened, so a resolution time is positive', () => {
    for (const matter of matters.filter((m) => m.closedOn !== null)) {
      expect(matter.closedOn! > matter.openedOn, matter.fileNumber).toBe(true);
    }
  });

  it('closes enough of them for an average to mean something', () => {
    expect(matters.filter((m) => m.closedOn !== null).length).toBeGreaterThanOrEqual(8);
  });

  it('leaves most of them open, as a working practice would', () => {
    const open = matters.filter((m) => m.closedOn === null);
    expect(open.length).toBeGreaterThan(matters.length / 2);
  });

  /**
   * 015/T026 — asserted here, in a suite that needs no database, because the integration
   * suite caught it and could not say whether the generator or the ROW was at fault.
   *
   * `015`'s average resolution time is `closed_on - opened_on`, so a matter that closes on or
   * before the day it opened contributes zero or a negative number to an average the dashboard
   * presents as a duration. And the same clock is not used twice: the generator takes `asOf`
   * as an argument, so the invariant has to hold for every day it might be run on, not merely
   * for the day someone happened to run it.
   */
  it('never closes a matter on or before the day it opened, whatever the clock says', () => {
    const days = ['2026-01-01', '2026-03-31', '2026-06-30', '2026-09-25', '2026-12-31'];
    for (const day of days) {
      const asOf = new Date(`${day}T00:00:00Z`);
      for (const firm of DEMO_FIRMS) {
        for (const matter of demoMatters(firm, asOf)) {
          if (matter.closedOn === null) continue;
          expect(
            matter.closedOn > matter.openedOn,
            `${day} ${firm.rfc} ${matter.fileNumber}: opened ${matter.openedOn}, closed ${matter.closedOn}`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('outcomes (015/Decision 9, closing 022/Decision 7)', () => {
  it('gives every closed matter an outcome and no open one', () => {
    for (const matter of matters) {
      if (matter.closedOn === null) {
        expect(matter.outcome, matter.fileNumber).toBeNull();
      } else {
        expect(matter.outcome, matter.fileNumber).not.toBeNull();
      }
    }
  });

  it('uses all four values, so every legend entry has data', () => {
    const used = new Set(matters.filter((m) => m.outcome !== null).map((m) => m.outcome));
    expect([...used].sort()).toEqual(['convenio', 'desfavorable', 'favorable', 'sin_resolucion']);
  });

  it('clears FR-009 floor of five declarations, or the demo shows "Datos insuficientes"', () => {
    expect(matters.filter((m) => m.outcome !== null).length).toBeGreaterThanOrEqual(5);
  });

  it('does not make the firm win everything — a demo nobody believes', () => {
    const declared = matters.filter((m) => m.outcome !== null);
    const successes = declared.filter((m) => m.outcome === 'favorable' || m.outcome === 'convenio');
    const rate = successes.length / declared.length;
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.95);
  });

  it('varies by matter type, so the by-type chart is not five identical bars', () => {
    const byType = new Map();
    for (const matter of matters.filter((m) => m.outcome !== null)) {
      const bucket = byType.get(matter.matterTypeName) ?? { wins: 0, total: 0 };
      bucket.total += 1;
      if (matter.outcome === 'favorable' || matter.outcome === 'convenio') bucket.wins += 1;
      byType.set(matter.matterTypeName, bucket);
    }
    const rates = [...byType.values()].filter((b) => b.total >= 2).map((b) => b.wins / b.total);
    expect(new Set(rates).size).toBeGreaterThan(1);
  });
});

describe('matter types', () => {
  it('uses all six defaults, so a by-type chart has six bars', () => {
    const used = new Set(matters.map((m) => m.matterTypeName));
    for (const type of DEFAULT_MATTER_TYPES) expect(used).toContain(type);
  });

  it('does not spread them perfectly evenly', () => {
    const counts = new Map<string, number>();
    for (const matter of matters) {
      counts.set(matter.matterTypeName, (counts.get(matter.matterTypeName) ?? 0) + 1);
    }
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeGreaterThan(1);
  });
});

describe('assignments (FR-007)', () => {
  const associates = DEMO_PEOPLE.filter((p) => p.archetype === 'AA').map((p) => p.slug);

  it('loads the two associates unevenly', () => {
    const leads = associates.map(
      (slug) => matters.filter((m) => m.leadSlug === slug).length,
    );
    expect(leads).toHaveLength(2);
    expect(Math.abs((leads[0] as number) - (leads[1] as number))).toBeGreaterThanOrEqual(3);
  });

  it('leaves at least three matters neither associate is on', () => {
    const untouched = matters.filter(
      (m) => !associates.includes(m.leadSlug ?? '') && !m.collaboratorSlugs.some((s) => associates.includes(s)),
    );
    expect(untouched.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves at least one matter with no assignment at all', () => {
    // 006's Decision 3 calls a zero-assignment case a real transient state; `seed.ts` seeds
    // one deliberately, and the assigned-scope screens need one to refuse against.
    expect(matters.some((m) => m.leadSlug === null && m.collaboratorSlugs.length === 0)).toBe(true);
  });

  it('never names the same person twice on one matter', () => {
    for (const matter of matters) {
      const everybody = [matter.leadSlug, ...matter.collaboratorSlugs].filter((s): s is string => s !== null);
      expect(new Set(everybody).size, matter.fileNumber).toBe(everybody.length);
    }
  });

  it('assigns only people who exist', () => {
    const slugs = new Set(DEMO_PEOPLE.map((p) => p.slug));
    for (const matter of matters) {
      if (matter.leadSlug !== null) expect(slugs).toContain(matter.leadSlug);
      for (const slug of matter.collaboratorSlugs) expect(slugs).toContain(slug);
    }
  });

  it('never leads with an archetype that holds no case capability', () => {
    // BM holds nothing on documents and is not a case worker; a BM lead would be a fixture
    // asserting something the product does not mean.
    const bm = new Set(DEMO_PEOPLE.filter((p) => p.archetype === 'BM').map((p) => p.slug));
    for (const matter of matters) expect(bm.has(matter.leadSlug ?? '')).toBe(false);
  });
});

describe('clients', () => {
  it('points every matter at a client index the firm actually has', () => {
    for (const matter of matters) {
      expect(matter.clientIndex).toBeGreaterThanOrEqual(0);
      expect(matter.clientIndex).toBeLessThan(25);
    }
  });

  it('gives some clients more than one matter, as a retained client would have', () => {
    const counts = new Map<number, number>();
    for (const matter of matters) counts.set(matter.clientIndex, (counts.get(matter.clientIndex) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeGreaterThan(1);
  });
});
