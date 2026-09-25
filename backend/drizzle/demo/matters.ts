/**
 * T018 — the firm's matters, their statuses, their dates and who is on them.
 * 022/FR-006, FR-007.
 *
 * WHAT THIS FILE IS FOR. `015-kpi-dashboard` computes active matters, average resolution
 * time, load per attorney and a quarterly trend. Each of those is a property of the data,
 * not of the dashboard: a chart over forty matters that are all `En Proceso`, all opened on
 * the same day and all led by the same person renders correctly and says nothing. So the
 * spread is generated deliberately and asserted in `demo-matters.test.ts`.
 *
 * THE CLOCK IS AN ARGUMENT, never `Date.now()`. Two machines running this on different days
 * must produce the same six quarters (FR-017), and `demo-rng.test.ts` scans this directory
 * to keep it that way. The caller passes the day the demo is being seeded.
 *
 * `closedOn` IS DERIVED FROM THE STATUS, matching what the product itself does: `case_file`'s
 * comment records that `closed_on` "is DERIVED from the target status's `isClosing` (FR-008a)
 * and is never accepted as request input". A fixture that set one without the other would put
 * the database in a state the application cannot reach.
 */
import { DEFAULT_CASE_STATUSES, DEFAULT_MATTER_TYPES } from '../../src/modules/case-core/catalogs/case-catalog.seed';
import { DEMO_PEOPLE, type DemoFirm } from './firm';
import { DEMO_SEED, intBetween, mulberry32, pick, shuffle } from './rng';

export interface DemoMatter {
  readonly fileNumber: string;
  /** Index into `demoClients(firm)`, resolved to a real id at write time. */
  readonly clientIndex: number;
  readonly matterTypeName: string;
  readonly statusName: string;
  /** `YYYY-MM-DD`, and never a `Date` — a date column is a calendar day, not an instant. */
  readonly openedOn: string;
  readonly closedOn: string | null;
  readonly leadSlug: string | null;
  readonly collaboratorSlugs: readonly string[];
}

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The first day of each of the last `count` quarters, oldest first, the last of which
 * contains `asOf`.
 *
 * Exported because the test asserts against the same arithmetic rather than restating it —
 * a second copy of a date calculation is a second chance to be wrong.
 */
export function quarterStarts(asOf: Date, count: number): readonly string[] {
  const currentQuarterStartMonth = Math.floor(asOf.getUTCMonth() / 3) * 3;
  const out: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const date = new Date(
      Date.UTC(asOf.getUTCFullYear(), currentQuarterStartMonth - back * 3, 1),
    );
    out.push(iso(date));
  }
  return out;
}

/** A day inside the quarter beginning at `start`, never later than `asOf`. */
function dayInQuarter(next: () => number, start: string, asOf: Date): string {
  const from = new Date(`${start}T00:00:00Z`);
  const quarterEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 3, 0));
  const latest = quarterEnd > asOf ? asOf : quarterEnd;
  const span = Math.max(
    0,
    Math.floor((latest.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const offset = span === 0 ? 0 : intBetween(next, 0, span);
  return iso(new Date(from.getTime() + offset * 24 * 60 * 60 * 1000));
}

const CLOSING_STATUS = DEFAULT_CASE_STATUSES.find((s) => s.isClosing)!.name;
const OPEN_STATUSES = DEFAULT_CASE_STATUSES.filter((s) => !s.isClosing).map((s) => s.name);

export function demoMatters(firm: DemoFirm, asOf: Date): readonly DemoMatter[] {
  const total = firm.sparse ? 5 : 40;
  const clientCount = firm.sparse ? 4 : 25;
  const quarters = quarterStarts(asOf, 6);

  // A seed per firm, so the two firms' data are independent but each is reproducible.
  const next = mulberry32(DEMO_SEED + firm.rfc.length * 7 + (firm.sparse ? 101 : 0));

  const leadCandidates = firm.sparse
    ? DEMO_PEOPLE.filter((p) => p.alsoAt !== undefined).map((p) => p.slug)
    : DEMO_PEOPLE.filter((p) => p.archetype === 'MP' || p.archetype === 'AA').map((p) => p.slug);
  const supportCandidates = firm.sparse
    ? []
    : DEMO_PEOPLE.filter((p) => p.archetype === 'PL' || p.archetype === 'CM').map((p) => p.slug);

  /**
   * FR-007 — the two associates carry visibly different loads, because "matters per
   * attorney" is one of `015`'s charts and an even split makes it a flat bar.
   *
   * Weighted by repetition rather than by a probability table: the list below is drawn from
   * uniformly, so `ramirez` appearing five times and `gonzalez` twice IS the weighting. It is
   * legible at a glance, which a table of floats would not be.
   */
  const associates = DEMO_PEOPLE.filter((p) => p.archetype === 'AA').map((p) => p.slug);
  const partner = DEMO_PEOPLE.find((p) => p.archetype === 'MP')!.slug;
  const weightedLeads = firm.sparse
    ? leadCandidates
    : [
        ...Array.from({ length: 5 }, () => associates[0] as string),
        ...Array.from({ length: 2 }, () => associates[1] as string),
        partner,
      ];

  const matters: DemoMatter[] = [];
  let sequence = 0;

  for (const [quarterIndex, start] of quarters.entries()) {
    // More recent quarters hold more matters: a practice that is growing, and a trend line
    // that is not flat. The last quarter is partial (it contains `asOf`), so it gets fewer.
    const share = [4, 5, 6, 8, 9, 8][quarterIndex] ?? 6;
    const count = firm.sparse ? (quarterIndex >= 4 ? 2 : quarterIndex === 3 ? 1 : 0) : share;

    for (let i = 0; i < count && matters.length < total; i += 1) {
      sequence += 1;
      const openedOn = dayInQuarter(next, start, asOf);
      const year = openedOn.slice(0, 4);

      // Older matters are likelier to have been resolved, which is what makes the average
      // resolution time computable and the "active" count smaller than the total.
      const closeChance = quarterIndex <= 1 ? 0.55 : quarterIndex <= 3 ? 0.3 : 0.08;
      const isClosed = next() < closeChance;

      const openedDate = new Date(`${openedOn}T00:00:00Z`);
      const maxDays = Math.floor((asOf.getTime() - openedDate.getTime()) / (24 * 60 * 60 * 1000));
      // At least a day, so `closed_on > opened_on` holds strictly.
      const durationDays = isClosed && maxDays >= 1 ? intBetween(next, 1, Math.min(maxDays, 420)) : 0;
      const closedOn =
        isClosed && durationDays >= 1
          ? iso(new Date(openedDate.getTime() + durationDays * 24 * 60 * 60 * 1000))
          : null;

      // One matter per firm is left entirely unstaffed — 006's Decision 3 transient state,
      // and the fixture the assigned-scope screens need to refuse against.
      const unstaffed = !firm.sparse && matters.length === total - 1;
      const leadSlug = unstaffed ? null : pick(next, weightedLeads);
      const collaboratorSlugs =
        unstaffed || supportCandidates.length === 0
          ? []
          : shuffle(next, supportCandidates).slice(0, next() < 0.45 ? 1 : 0);

      matters.push({
        fileNumber: `EXP-${year}-${String(2000 + sequence).padStart(4, '0')}`,
        clientIndex: intBetween(next, 0, clientCount - 1),
        matterTypeName: pick(next, DEFAULT_MATTER_TYPES),
        statusName: closedOn !== null ? CLOSING_STATUS : pick(next, OPEN_STATUSES),
        openedOn,
        closedOn,
        leadSlug,
        collaboratorSlugs,
      });
    }
  }

  return matters;
}
