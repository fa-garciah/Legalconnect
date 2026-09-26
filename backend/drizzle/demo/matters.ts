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
import { DEFAULT_CASE_STATUSES } from '../../src/modules/case-core/catalogs/case-catalog.seed';
import { createHash } from 'node:crypto';
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
  /**
   * 015/Decision 9, closing the forward dependency `022`/Decision 7 recorded: the column did
   * not exist when `022` shipped, so its closed matters had no outcome and the KPI screen read
   * "Datos insuficientes" on its most prominent tile — the exact undemonstrable state `022`
   * existed to end.
   *
   * `null` on every OPEN matter, by the same rule the database enforces
   * (`case_file_outcome_requires_closed`).
   */
  readonly outcome: 'favorable' | 'desfavorable' | 'convenio' | 'sin_resolucion' | null;
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

/**
 * The firm PRACTISES IN A FEW AREAS, not evenly across all six — which is both more realistic
 * and what makes `015`'s by-type success chart legible.
 *
 * Spreading 40 matters uniformly over six types leaves ~3 closed matters each, and `015`/FR-009
 * refuses a rate below five declarations, so every bar read "Datos insuficientes" — a correct
 * refusal that demonstrated nothing. A real firm concentrates: `case-catalog.seed.ts` says as
 * much, calling a boutique that retires five of the six "the expected use, not a misuse".
 *
 * Weighted by repetition, and `pick` consumes exactly one random number either way — so this
 * changes the distribution without shifting the stream, and no other generated value moves.
 * Every type still appears, so the catalog is exercised.
 */
const WEIGHTED_MATTER_TYPES: readonly string[] = [
  'Mercantil', 'Mercantil', 'Mercantil', 'Mercantil', 'Mercantil',
  'Civil', 'Civil', 'Civil', 'Civil',
  'Laboral', 'Laboral', 'Laboral',
  'Familiar',
  'Amparo',
  'Penal',
];

type DemoOutcome = 'favorable' | 'desfavorable' | 'convenio' | 'sin_resolucion';

/**
 * 015/Decision 9 — how each closed demo matter ended.
 *
 * DELIBERATELY UNEVEN BY MATTER TYPE, because `015`'s "success rate by matter type" chart is
 * five identical bars otherwise, and five identical bars prove nothing about whether the chart
 * works. The weighting is expressed as repetition in a list drawn from uniformly — legible at a
 * glance, where a table of probabilities would not be.
 *
 * The spread is also not flattering: `Penal` and `Laboral` lose more often than `Mercantil`
 * wins, so the screen has something to show other than success. A demo firm that wins
 * everything is a demo nobody believes.
 */
const OUTCOMES_BY_TYPE: Readonly<Record<string, readonly DemoOutcome[]>> = {
  Mercantil: ['favorable', 'favorable', 'favorable', 'convenio', 'convenio', 'desfavorable'],
  Civil: ['favorable', 'favorable', 'convenio', 'desfavorable', 'sin_resolucion'],
  Laboral: ['favorable', 'convenio', 'desfavorable', 'desfavorable', 'sin_resolucion'],
  Familiar: ['convenio', 'convenio', 'favorable', 'sin_resolucion'],
  Penal: ['desfavorable', 'desfavorable', 'favorable', 'sin_resolucion'],
  Amparo: ['favorable', 'desfavorable', 'convenio', 'sin_resolucion'],
};

const DEFAULT_OUTCOME_SPREAD: readonly DemoOutcome[] = [
  'favorable',
  'convenio',
  'desfavorable',
  'sin_resolucion',
];

/**
 * DERIVED FROM THE MATTER'S OWN IDENTITY, NOT DRAWN FROM THE RNG — and that is a correction
 * worth recording, because the first version drew it with `pick(next, …)` and broke something
 * subtle.
 *
 * Consuming one more random number per matter shifts the whole stream, so every later matter's
 * dates, client and status change too. The generator stayed self-consistent, but the rows
 * already in a developer's database did not: `seed-demo.ts` matches on `file_number`, so a
 * matter that was OPEN on disk received the outcome of a different, closed matter — and
 * `case_file_outcome_requires_closed` refused the write. The database caught it, which is
 * exactly what that constraint is for.
 *
 * Hashing the file number instead leaves `022`'s generated firm byte-identical apart from the
 * new field, so no file number moves and no stale row is left behind.
 */
function outcomeFor(fileNumber: string, matterTypeName: string): DemoOutcome {
  const spread = OUTCOMES_BY_TYPE[matterTypeName] ?? DEFAULT_OUTCOME_SPREAD;
  const digest = createHash('sha256').update(`demo-outcome-${fileNumber}`).digest();
  return spread[(digest[0] as number) % spread.length] as DemoOutcome;
}

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

      /*
       * Older matters are likelier to have been resolved, which is what makes the average
       * resolution time computable and the "active" count smaller than the total.
       *
       * THE RECENT QUARTERS CLOSE MORE THAN REALISM ALONE WOULD SUGGEST, deliberately: `015`
       * refuses to report a success rate from fewer than five declared outcomes (FR-009), and
       * the KPI screen defaults to the current quarter. A demo firm that closed two matters
       * last quarter shows "Datos insuficientes" on its most prominent tile — a correct
       * refusal, and a poor demonstration of the feature the firm exists to demonstrate.
       */
      const closeChance = quarterIndex <= 1 ? 0.55 : quarterIndex <= 3 ? 0.35 : 0.45;
      const isClosed = next() < closeChance;

      const openedDate = new Date(`${openedOn}T00:00:00Z`);
      const maxDays = Math.floor((asOf.getTime() - openedDate.getTime()) / (24 * 60 * 60 * 1000));
      /*
       * DRAWN UNCONDITIONALLY, and used only when the matter closed.
       *
       * Drawing it inside the `isClosed` branch made the RNG stream depend on the close
       * DECISION, so changing a close probability shifted every later matter's dates, client
       * and status — which meant tuning the distribution silently regenerated the firm and
       * left rows from the previous generation behind in a developer's database. Consuming the
       * number either way makes the stream stable under exactly the kind of tuning above.
       */
      const candidateDuration = intBetween(next, 1, Math.max(1, Math.min(maxDays, 420)));
      const durationDays = isClosed && maxDays >= 1 ? candidateDuration : 0;
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

      const matterTypeName = pick(next, WEIGHTED_MATTER_TYPES);
      const fileNumber = `EXP-${year}-${String(2000 + sequence).padStart(4, '0')}`;

      matters.push({
        fileNumber,
        clientIndex: intBetween(next, 0, clientCount - 1),
        matterTypeName,
        statusName: closedOn !== null ? CLOSING_STATUS : pick(next, OPEN_STATUSES),
        openedOn,
        closedOn,
        outcome: closedOn === null ? null : outcomeFor(fileNumber, matterTypeName),
        leadSlug,
        collaboratorSlugs,
      });
    }
  }

  return matters;
}
