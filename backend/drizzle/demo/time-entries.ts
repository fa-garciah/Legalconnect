/**
 * 009 T030 — the demo firm's recorded time. 009/FR-022, Decision 11.
 *
 * `/horas` with five identical rows says nothing, so the history is generated with a shape:
 * six weeks of working days, only on matters each person is on and only while the matter was
 * open, and DELIBERATELY UNEVEN loads — the senior associate heaviest, the junior associate
 * light, the partner modest and mostly by hand, the paralegal steady, the case manager in short
 * coordination entries. `demo-time-entries.test.ts` asserts each of those.
 *
 * IDEMPOTENT ACROSS DAYS, NOT ONLY ACROSS RUNS. Each entry's id is derived from (firm, person,
 * working-day index counted back from the seed day, position within the day) — never from the
 * calendar date. Re-seeding next week therefore hits the same ids and the writer UPDATES them to
 * the new window instead of adding a second six weeks beside the first. A date-dependent id is what
 * lets `demo-seed.test.ts`'s document count drift upward on a machine re-seeded on different days:
 * document ids are keyed on the matter's file number, and file numbers are generated from the seed
 * date (found 2026-10-08: 149 documents where 130 were expected). This file does not repeat it.
 *
 * THE CLOCK IS AN ARGUMENT (022/FR-017): the caller passes the seed day.
 */
import { DEMO_PEOPLE, type DemoFirm } from './firm';
import type { DemoMatter } from './matters';
import { DEMO_SEED, intBetween, mulberry32, pick } from './rng';

export interface DemoTimeEntry {
  readonly personSlug: string;
  readonly matterFileNumber: string;
  readonly workDate: string;
  readonly minutes: number;
  readonly description: string;
  readonly source: 'timer' | 'manual';
  /** ISO instants, timer entries only. */
  readonly startedAt: string | null;
  readonly stoppedAt: string | null;
  /** When the entry became time: the stop for a timer, the evening of the work day for manual. */
  readonly loggedAt: string;
  /** Parts for `deterministicUuid('time-entry', ...idKey)`. Date-free on purpose (see header). */
  readonly idKey: readonly string[];
}

interface Load {
  readonly perDay: readonly [number, number];
  readonly minutes: readonly [number, number];
  readonly manualShare: number;
}

/** By role, so the shape survives a renamed person. */
const LOAD_BY_ARCHETYPE: Readonly<Record<'MP' | 'AA' | 'PL' | 'CM', Load>> = {
  MP: { perDay: [1, 2], minutes: [15, 90], manualShare: 0.8 },
  AA: { perDay: [2, 4], minutes: [30, 120], manualShare: 0.3 },
  PL: { perDay: [1, 3], minutes: [30, 110], manualShare: 0.4 },
  CM: { perDay: [1, 2], minutes: [10, 30], manualShare: 0.5 },
};

/** The senior and junior associate differ, which is the point of having two. */
const LOAD_BY_SLUG: Readonly<Record<string, Load>> = {
  ramirez: { perDay: [3, 5], minutes: [30, 150], manualShare: 0.3 },
  gonzalez: { perDay: [0, 2], minutes: [20, 90], manualShare: 0.35 },
};

const DESCRIPTIONS: Readonly<Record<'MP' | 'AA' | 'PL' | 'CM', readonly string[]>> = {
  MP: [
    'Revisión de estrategia procesal con el equipo',
    'Llamada con el cliente sobre el estado del asunto',
    'Revisión final del escrito antes de su presentación',
    'Reunión de seguimiento con la dirección jurídica del cliente',
  ],
  AA: [
    'Redacción de contestación de demanda',
    'Análisis de jurisprudencia aplicable',
    'Preparación de audiencia de pruebas',
    'Redacción de escrito de alegatos',
    'Revisión de contrato y observaciones al cliente',
    'Elaboración de recurso de apelación',
    'Asistencia a audiencia en el juzgado',
  ],
  PL: [
    'Integración del expediente y control de anexos',
    'Búsqueda de jurisprudencia y tesis aisladas',
    'Presentación de escrito en oficialía de partes',
    'Revisión de acuerdos publicados en el boletín judicial',
  ],
  CM: [
    'Coordinación de agenda de audiencias',
    'Seguimiento de plazos procesales',
    'Coordinación con el perito designado',
  ],
};

const WORKING_DAYS = 30;
const WORKING_DAYS_SPARSE = 5;

/** The last `count` Monday–Friday dates strictly before `asOf`, newest first. */
function workingDaysBefore(asOf: Date, count: number): string[] {
  const out: string[] = [];
  const cursor = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  while (out.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.push(cursor.toISOString().slice(0, 10));
  }
  return out;
}

/** An hour in Mexico City (fixed UTC−6) on `day`, as the UTC instant the column stores. */
function mexicoInstant(day: string, hour: number, minute: number): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hour + 6, minute));
}

function archetypeIn(firm: DemoFirm, slug: string): string | undefined {
  const person = DEMO_PEOPLE.find((p) => p.slug === slug);
  if (!person) return undefined;
  if (!firm.sparse) return person.archetype;
  return person.alsoAt?.firmRfc === firm.rfc ? person.alsoAt.archetype : undefined;
}

export function demoTimeEntries(
  firm: DemoFirm,
  matters: readonly DemoMatter[],
  asOf: Date,
): readonly DemoTimeEntry[] {
  const next = mulberry32(DEMO_SEED + 909 + (firm.sparse ? 7 : 0));
  const days = workingDaysBefore(asOf, firm.sparse ? WORKING_DAYS_SPARSE : WORKING_DAYS);
  const entries: DemoTimeEntry[] = [];

  const slugs = DEMO_PEOPLE.map((p) => p.slug).filter((slug) => {
    const archetype = archetypeIn(firm, slug);
    return archetype === 'MP' || archetype === 'AA' || archetype === 'PL' || archetype === 'CM';
  });

  for (const slug of slugs) {
    const archetype = archetypeIn(firm, slug) as 'MP' | 'AA' | 'PL' | 'CM';
    const load = LOAD_BY_SLUG[slug] ?? LOAD_BY_ARCHETYPE[archetype];
    const theirs = matters.filter((m) => m.leadSlug === slug || m.collaboratorSlugs.includes(slug));

    for (const [dayIndex, day] of days.entries()) {
      const open = theirs.filter((m) => m.openedOn <= day && (m.closedOn === null || day <= m.closedOn));
      // Drawn whether or not there is a matter, so one day's lack of work never shifts the
      // stream for the days after it — which is what keeps ids stable across re-seeds.
      const count = intBetween(next, load.perDay[0], load.perDay[1]);
      let hour = 9;
      for (let k = 0; k < count; k += 1) {
        const matterDraw = next();
        const minutes = intBetween(next, load.minutes[0], load.minutes[1]);
        const manual = next() < load.manualShare;
        const description = pick(next, DESCRIPTIONS[archetype]);
        if (open.length === 0) continue;
        const matter = open[Math.floor(matterDraw * open.length)]!;

        const start = mexicoInstant(day, Math.min(hour, 17), k * 7 % 60);
        const stop = new Date(start.getTime() + minutes * 60_000);
        hour += Math.ceil(minutes / 60);

        entries.push({
          personSlug: slug,
          matterFileNumber: matter.fileNumber,
          workDate: day,
          minutes,
          description,
          source: manual ? 'manual' : 'timer',
          startedAt: manual ? null : start.toISOString(),
          stoppedAt: manual ? null : stop.toISOString(),
          loggedAt: manual ? mexicoInstant(day, 19, 30 + k).toISOString() : stop.toISOString(),
          idKey: [firm.rfc, slug, `d${dayIndex}`, `k${k}`],
        });
      }
    }
  }

  return entries;
}
